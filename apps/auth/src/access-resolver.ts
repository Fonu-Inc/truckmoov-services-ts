import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ACCESS_CHANGED_SUBJECT, portalOfPermission, predefinedRole, type PermissionKey } from '@shared/access';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { SYSTEM_TENANT_ID, portalFor, type Portal } from '@shared/identity';
import type { StoredUser, UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TENANT_ROLE_REPOSITORY, type TenantRoleRepository } from './tenant-role.repository';
import { PERMISSION_REMOVAL_REPOSITORY, type PermissionRemovalRepository } from './permission-removal.repository';

export type ResolvedAccess = {
  userId: string;
  tenantId: string;
  portal: Portal;
  /** False for a disabled or deleted account: refused on its next request, everywhere. */
  active: boolean;
  permissions: PermissionKey[];
};

const CACHE_TTL_MS = 30_000;

/** What a user may do right now, read from the account rather than from their token. */
@Injectable()
export class AccessResolver {
  private readonly cache = new Map<string, { access: ResolvedAccess | null; expiresAt: number }>();

  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) private readonly roles: TenantRoleRepository,
    @Inject(PERMISSION_REMOVAL_REPOSITORY) private readonly removals: PermissionRemovalRepository,
  ) {}

  async resolve(userRepository: Pick<UserRepository, 'findById'>, userId: string): Promise<ResolvedAccess | null> {
    const now = Date.now();
    const cached = this.cache.get(userId);
    if (cached && now < cached.expiresAt) return cached.access;
    const user = await userRepository.findById(userId);
    let expiresAt = now + CACHE_TTL_MS;
    let access: ResolvedAccess | null = null;
    if (user) {
      const removals = await this.removals.activeForTenant(user.tenantId);
      const removed = new Set(removals.filter((r) => r.effectiveAt.getTime() <= now).map((r) => r.permission));
      // A removal applies on the first request at its effective time, so a
      // cached answer never outlives the next one due.
      for (const r of removals) {
        if (r.effectiveAt.getTime() > now) expiresAt = Math.min(expiresAt, r.effectiveAt.getTime());
      }
      access = toAccess(user, (await this.permissionsOf(user)).filter((p) => !removed.has(p)));
    }
    this.cache.set(userId, { access, expiresAt });
    return access;
  }

  /**
   * A custom role replaces the predefined role's permissions. Either way a
   * role only counts inside the portal it belongs to: a system role held
   * inside a tenant is worth nothing.
   */
  private async permissionsOf(user: StoredUser): Promise<PermissionKey[]> {
    const portal = portalFor(user);
    if (user.customRoleId) {
      const custom = await this.roles.findById(user.tenantId, user.customRoleId);
      return (custom?.permissions ?? []).filter((p) => portalOfPermission(p) === portal);
    }
    const bundle = predefinedRole(user.role);
    return bundle && bundle.portal === portal ? [...bundle.permissions] : [];
  }

  forget(userId: string): void {
    this.cache.delete(userId);
  }
}

function toAccess(user: StoredUser, permissions: PermissionKey[]): ResolvedAccess {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    portal: portalFor(user),
    active: (user.accountStatus ?? 'enabled') === 'enabled',
    permissions,
  };
}

/** Tells this service and every other one that a user's access changed. */
@Injectable()
export class AccessChangeNotifier {
  private readonly logger = new Logger(AccessChangeNotifier.name);

  constructor(
    @Inject(AccessResolver) private readonly resolver: AccessResolver,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  changed(userId: string): void {
    this.resolver.forget(userId);
    this.bus
      .publish(ACCESS_CHANGED_SUBJECT, {
        id: randomUUID(),
        type: 'access.changed',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: SYSTEM_TENANT_ID,
        data: { userId },
      })
      .catch((error: Error) => this.logger.warn(`access_changed_publish_failed:${userId}:${error.message}`));
  }
}
