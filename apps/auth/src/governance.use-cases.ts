import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PREDEFINED_ROLES, isPermission, portalOfPermission, type PermissionKey } from '@shared/access';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { sweepSafely } from '@shared/observability';
import { SYSTEM_ROLES, TENANT_ROLES, type Role } from '@shared/rbac';
import { ActivityLogService } from './activity-log.service';
import { AccessChangeNotifier, AccessResolver } from './access-resolver';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  PERMISSION_REMOVAL_REPOSITORY,
  type PermissionRemoval,
  type PermissionRemovalRepository,
  type PermissionRemovalStatus,
} from './permission-removal.repository';
import { TENANT_ROLE_REPOSITORY, type TenantRoleRepository } from './tenant-role.repository';

export class InvalidRemovalError extends Error {}
export class RemovalNotFoundError extends Error {}
export class RemovalNotCancellableError extends Error {}

type Staff = { id: string; email: string; role: string; permissions: PermissionKey[] };

export type ScheduleRemovalInput = { tenantId: string; permission: string; effectiveAt: string; reason: string };

/**
 * What the governance team does: see what each tenant's roles grant and who
 * holds them, and take permissions away on a date. The notice period and who
 * is told are the team's own process; this only honours the date.
 *
 * Checks the governance permission itself rather than leaving it to the
 * route rule alone, which only records until enforcement is switched on:
 * these routes are new, so nothing depends on them being looser.
 */
@Injectable()
export class GovernanceUseCases {
  constructor(
    @Inject(PERMISSION_REMOVAL_REPOSITORY) private readonly removals: PermissionRemovalRepository,
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: TenantRoleRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(AccessChangeNotifier) private readonly changes: AccessChangeNotifier,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  /** Every role in a tenant, what it grants, and who holds it. */
  async review(accessToken: string, tenantId: string) {
    await this.staff(accessToken, 'admin.governance.read');
    const members = (await this.users.findAllByTenant(tenantId)).filter((u) => u.tenantId !== SYSTEM_TENANT_ID);
    const custom = await this.roles.listByTenant(tenantId);
    const holders = (match: (u: (typeof members)[number]) => boolean) =>
      members.filter(match).map((u) => ({ userId: u.id, email: u.email, accountStatus: u.accountStatus ?? 'enabled' }));
    return {
      tenantId,
      predefined: TENANT_ROLES.map((role) => ({
        role,
        permissions: [...PREDEFINED_ROLES[role].permissions],
        holders: holders((u) => u.role === role && !u.customRoleId),
      })),
      custom: custom.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions,
        holders: holders((u) => u.customRoleId === role.id),
      })),
      removals: await this.removals.list({ tenantId }),
    };
  }

  async schedule(accessToken: string, input: ScheduleRemovalInput) {
    const staff = await this.staff(accessToken, 'admin.governance.manage');
    const effectiveAt = new Date(input.effectiveAt);
    if (!isPermission(input.permission) || portalOfPermission(input.permission) !== 'tenant') {
      throw new InvalidRemovalError('Only tenant permissions can be removed from a tenant');
    }
    if (Number.isNaN(effectiveAt.getTime()) || effectiveAt.getTime() <= Date.now()) {
      throw new InvalidRemovalError('A removal takes effect in the future, never at once');
    }
    if (!input.reason?.trim()) throw new InvalidRemovalError('A removal needs a reason');
    const removal: PermissionRemoval = {
      id: randomUUID(),
      tenantId: input.tenantId,
      permission: input.permission,
      effectiveAt,
      reason: input.reason.trim(),
      status: 'scheduled',
      createdBy: staff.id,
      createdAt: new Date(),
      cancelledBy: null,
      cancelledAt: null,
      appliedAt: null,
    };
    await this.removals.save(removal);
    await this.forgetTenant(removal.tenantId);
    await this.audit(staff, 'permission_removal.scheduled', removal);
    return removal;
  }

  async cancel(accessToken: string, id: string) {
    const staff = await this.staff(accessToken, 'admin.governance.manage');
    const removal = await this.removals.findById(id);
    if (!removal) throw new RemovalNotFoundError('Removal not found');
    if (removal.status !== 'scheduled' || removal.effectiveAt.getTime() <= Date.now()) {
      throw new RemovalNotCancellableError('Only a removal not yet in effect can be cancelled');
    }
    const cancelled = { ...removal, status: 'cancelled' as const, cancelledBy: staff.id, cancelledAt: new Date() };
    await this.removals.save(cancelled);
    await this.forgetTenant(removal.tenantId);
    await this.audit(staff, 'permission_removal.cancelled', cancelled);
    return cancelled;
  }

  async list(accessToken: string, filters: { tenantId?: string; status?: PermissionRemovalStatus }) {
    await this.staff(accessToken, 'admin.governance.read');
    return this.removals.list(filters);
  }

  /** Staff roles, managed by the governance team and super admins alike. */
  async setStaffRole(accessToken: string, userId: string, role: string) {
    const staff = await this.staff(accessToken, 'admin.staff.manage');
    if (!(SYSTEM_ROLES as readonly string[]).includes(role)) throw new InvalidRemovalError('Not a staff role');
    const target = await this.users.findById(userId);
    if (!target || target.tenantId !== SYSTEM_TENANT_ID) throw new RemovalNotFoundError('Staff member not found');
    if (target.id === staff.id) throw new ForbiddenError();
    const granted = PREDEFINED_ROLES[role as Role].permissions;
    if (granted.some((p) => !staff.permissions.includes(p))) throw new ForbiddenError();
    await this.users.updateRole(userId, role);
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action: 'staff_role.changed',
      entityType: 'user',
      entityId: userId,
      summary: `Changed ${target.email} from ${target.role} to ${role}`,
      actorId: staff.id,
      actorRole: staff.role,
      actorEmail: staff.email,
      metadata: { from: target.role, to: role },
    });
    return { userId, role };
  }

  /** Marks due removals applied and tells every service to drop what it cached. */
  async applyDue(now = new Date()): Promise<number> {
    const due = await this.removals.dueBy(now);
    for (const removal of due) {
      await this.removals.save({ ...removal, status: 'applied', appliedAt: now });
      await this.forgetTenant(removal.tenantId);
    }
    return due.length;
  }

  private async staff(accessToken: string, permission: PermissionKey): Promise<Staff> {
    const user = this.tokens.resolveAccessToken(accessToken);
    const access = user ? await this.access.resolve(this.users, user.id) : null;
    if (!user || !access?.active || access.portal !== 'admin' || !access.permissions.includes(permission)) {
      throw new ForbiddenError();
    }
    return { id: user.id, email: user.email, role: user.role, permissions: access.permissions };
  }

  private async forgetTenant(tenantId: string) {
    for (const member of await this.users.findAllByTenant(tenantId)) this.changes.changed(member.id);
  }

  private async audit(staff: Staff, action: string, removal: PermissionRemoval) {
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action,
      entityType: 'permission_removal',
      entityId: removal.id,
      summary: `${action.split('.')[1]} removal of ${removal.permission} from tenant ${removal.tenantId}`,
      actorId: staff.id,
      actorRole: staff.role,
      actorEmail: staff.email,
      metadata: {
        tenantId: removal.tenantId,
        permission: removal.permission,
        effectiveAt: removal.effectiveAt.toISOString(),
        reason: removal.reason,
      },
    });
  }
}

const SWEEP_MS = 30_000;

/** Applies removals as they come due, so every service's cache follows within a request. */
@Injectable()
export class PermissionRemovalSweep implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PermissionRemovalSweep.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(GovernanceUseCases) private readonly governance: GovernanceUseCases) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => sweepSafely(this.logger, 'permission_removal', () => this.governance.applyDue()), SWEEP_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
