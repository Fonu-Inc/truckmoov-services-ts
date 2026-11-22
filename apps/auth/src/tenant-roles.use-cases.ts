import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PREDEFINED_ROLES, isPermission, portalOfPermission, type PermissionKey } from '@shared/access';
import { SYSTEM_ROLES, TENANT_ROLES } from '@shared/rbac';
import { SYSTEM_TENANT_ID, isPlatformActor } from '@shared/identity';
import { ActivityLogService } from './activity-log.service';
import { AccessChangeNotifier, AccessResolver } from './access-resolver';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TENANT_ROLE_REPOSITORY, type TenantRole, type TenantRoleRepository } from './tenant-role.repository';

export class InvalidTenantRoleError extends Error {}
export class TenantRoleNotFoundError extends Error {}
export class TenantRoleInUseError extends Error {}
export class TenantRoleNameTakenError extends Error {}

export type TenantRoleInput = { name: string; description?: string | null; permissions: string[] };

type Actor = { id: string; email: string; role: string; tenantId: string; permissions: PermissionKey[] };

const NAME_MAX = 80;

/**
 * A personal role holds one person's own permission set. It is an ordinary
 * custom role under a reserved name, hidden from the role list and never
 * assignable to anyone else.
 */
const PERSONAL_PREFIX = 'personal:';
const personalRoleName = (userId: string) => `${PERSONAL_PREFIX}${userId}`;
const isPersonal = (role: TenantRole) => role.name.startsWith(PERSONAL_PREFIX);

type RolePortal = 'tenant' | 'admin';

/**
 * Tenants build their own roles from tenant-portal permissions, next to the
 * predefined ones they cannot edit. No granting what you don't have: an
 * admin can only put a permission into a role, or give a role to someone,
 * when they hold every permission in it themselves.
 */
@Injectable()
export class TenantRolesUseCases {
  protected readonly portal: RolePortal = 'tenant';

  constructor(
    @Inject(TENANT_ROLE_REPOSITORY) protected readonly roles: TenantRoleRepository,
    @Inject(USER_REPOSITORY) protected readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(AccessChangeNotifier) private readonly changes: AccessChangeNotifier,
    @Inject(ActivityLogService) protected readonly activity: ActivityLogService,
  ) {}

  async list(accessToken: string) {
    const actor = await this.actor(accessToken);
    const names = this.portal === 'admin' ? SYSTEM_ROLES : TENANT_ROLES;
    const predefined = names.map((role) => ({ role, permissions: [...PREDEFINED_ROLES[role].permissions], editable: false }));
    const stored = await this.roles.listByTenant(actor.tenantId);
    const personal = stored
      .filter(isPersonal)
      .map((role) => ({ id: role.id, userId: role.name.slice(PERSONAL_PREFIX.length), permissions: role.permissions }));
    return { predefined, custom: stored.filter((role) => !isPersonal(role)).map(toView), personal };
  }

  async create(accessToken: string, input: TenantRoleInput) {
    const actor = await this.actor(accessToken);
    const { name, permissions } = this.validated(actor, input);
    if (await this.roles.findByName(actor.tenantId, name)) throw new TenantRoleNameTakenError('A role with this name exists');
    const now = new Date();
    const role: TenantRole = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      name,
      description: input.description?.trim() || null,
      permissions,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    await this.roles.save(role);
    await this.audit(actor, 'tenant_role.created', role, `Created role ${role.name}`);
    return toView(role);
  }

  async update(accessToken: string, id: string, input: TenantRoleInput) {
    const actor = await this.actor(accessToken);
    const existing = await this.shared(actor, id);
    // Editing a role hands its new permissions to everyone holding it, so the
    // editor must hold the old ones too: otherwise they could strip what they
    // cannot grant back.
    this.assertHolds(actor, existing.permissions);
    const { name, permissions } = this.validated(actor, input);
    const clash = await this.roles.findByName(actor.tenantId, name);
    if (clash && clash.id !== id) throw new TenantRoleNameTakenError('A role with this name exists');
    const role = { ...existing, name, description: input.description?.trim() || null, permissions, updatedAt: new Date() };
    await this.roles.save(role);
    await this.notifyHolders(actor.tenantId, id);
    await this.audit(actor, 'tenant_role.updated', role, `Changed role ${role.name}`, {
      before: existing.permissions,
      after: permissions,
    });
    return toView(role);
  }

  async remove(accessToken: string, id: string) {
    const actor = await this.actor(accessToken);
    const existing = await this.shared(actor, id);
    this.assertHolds(actor, existing.permissions);
    if ((await this.holders(actor.tenantId, id)).length > 0) {
      throw new TenantRoleInUseError('Move everyone off this role before deleting it');
    }
    await this.roles.delete(actor.tenantId, id);
    await this.audit(actor, 'tenant_role.deleted', existing, `Deleted role ${existing.name}`);
  }

  /** Gives a user a custom role, or with null returns them to their predefined role. */
  async assign(accessToken: string, userId: string, customRoleId: string | null) {
    const actor = await this.actor(accessToken);
    const target = await this.target(actor, userId);
    const role = customRoleId ? await this.found(actor, customRoleId) : null;
    if (role && isPersonal(role) && role.name !== personalRoleName(userId)) throw new TenantRoleNotFoundError('Role not found');
    const granted = role
      ? role.permissions
      : [...(PREDEFINED_ROLES[target.role as keyof typeof PREDEFINED_ROLES]?.permissions ?? [])];
    this.assertHolds(actor, granted);
    await this.users.updateCustomRole(userId, customRoleId);
    await this.activity.record({
      tenantId: actor.tenantId,
      service: 'auth',
      action: 'tenant_role.assigned',
      entityType: 'user',
      entityId: userId,
      summary: customRoleId ? `Gave ${target.email} a custom role` : `Returned ${target.email} to ${target.role}`,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      metadata: { customRoleId },
    });
    return { userId, customRoleId };
  }

  /**
   * Sets one staff member's own permissions by giving them a personal role,
   * or with an empty list returns them to their predefined role. The changer
   * must hold what the person has now as well as what they will have.
   */
  async setPersonalPermissions(accessToken: string, userId: string, permissions: string[]) {
    const actor = await this.actor(accessToken);
    const target = await this.target(actor, userId);
    if (target.id === actor.id) throw new ForbiddenError();
    this.assertHolds(actor, await this.currentPermissions(target));

    const name = personalRoleName(userId);
    const existing = await this.roles.findByName(actor.tenantId, name);
    if (permissions.length === 0) {
      await this.users.updateCustomRole(userId, null);
      if (existing) await this.roles.delete(actor.tenantId, existing.id);
      await this.auditUser(actor, target, 'Returned to their predefined role', { customRoleId: null });
      return { userId, customRoleId: null, permissions: [...(PREDEFINED_ROLES[target.role as keyof typeof PREDEFINED_ROLES]?.permissions ?? [])] };
    }

    const checked = this.checkedPermissions(actor, permissions);
    const now = new Date();
    const role: TenantRole = existing
      ? { ...existing, permissions: checked, updatedAt: now }
      : {
          id: randomUUID(),
          tenantId: actor.tenantId,
          name,
          description: `Personal permissions for ${target.email}`.slice(0, 240),
          permissions: checked,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        };
    await this.roles.save(role);
    if (target.customRoleId === role.id) this.changes.changed(userId);
    else await this.users.updateCustomRole(userId, role.id);
    await this.auditUser(actor, target, 'Changed personal permissions', { customRoleId: role.id, permissions: checked });
    return { userId, customRoleId: role.id, permissions: checked };
  }

  private async actor(accessToken: string): Promise<Actor> {
    const user = this.tokens.resolveAccessToken(accessToken);
    const access = user ? await this.access.resolve(this.users, user.id) : null;
    if (!user || !access?.active || access.portal !== this.portal) throw new ForbiddenError();
    return { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, permissions: access.permissions };
  }

  /** Someone the actor may manage: same tenant, and staff when this is the admin portal. */
  private async target(actor: Actor, userId: string) {
    const target = await this.users.findById(userId);
    if (!target || target.tenantId !== actor.tenantId) throw new TenantRoleNotFoundError('User not found');
    if (this.portal === 'admin' && (target.tenantId !== SYSTEM_TENANT_ID || !isPlatformActor(target))) {
      throw new TenantRoleNotFoundError('User not found');
    }
    return target;
  }

  private async currentPermissions(target: { tenantId: string; role: string; customRoleId?: string | null }): Promise<PermissionKey[]> {
    const custom = target.customRoleId ? await this.roles.findById(target.tenantId, target.customRoleId) : null;
    return custom?.permissions ?? [...(PREDEFINED_ROLES[target.role as keyof typeof PREDEFINED_ROLES]?.permissions ?? [])];
  }

  private validated(actor: Actor, input: TenantRoleInput): { name: string; permissions: PermissionKey[] } {
    const name = input.name?.trim() ?? '';
    if (!name || name.length > NAME_MAX) throw new InvalidTenantRoleError(`A role needs a name of at most ${NAME_MAX} characters`);
    if (name.toLowerCase().startsWith(PERSONAL_PREFIX)) throw new InvalidTenantRoleError(`A role name cannot start with "${PERSONAL_PREFIX}"`);
    return { name, permissions: this.checkedPermissions(actor, input.permissions ?? []) };
  }

  private checkedPermissions(actor: Actor, input: string[]): PermissionKey[] {
    const permissions = [...new Set(input)];
    if (permissions.length === 0) throw new InvalidTenantRoleError('A role needs at least one permission');
    const foreign = permissions.filter((p) => !isPermission(p) || portalOfPermission(p) !== this.portal);
    if (foreign.length) throw new InvalidTenantRoleError(`Not ${this.portal} permissions: ${foreign.join(', ')}`);
    this.assertHolds(actor, permissions as PermissionKey[]);
    return permissions as PermissionKey[];
  }

  private assertHolds(actor: Actor, permissions: readonly PermissionKey[]): void {
    if (permissions.some((p) => !actor.permissions.includes(p))) throw new ForbiddenError();
  }

  private async found(actor: Actor, id: string): Promise<TenantRole> {
    const role = await this.roles.findById(actor.tenantId, id);
    if (!role) throw new TenantRoleNotFoundError('Role not found');
    return role;
  }

  /** A role shared by name; personal roles are only changed through their owner. */
  private async shared(actor: Actor, id: string): Promise<TenantRole> {
    const role = await this.found(actor, id);
    if (isPersonal(role)) throw new TenantRoleNotFoundError('Role not found');
    return role;
  }

  private async holders(tenantId: string, roleId: string) {
    return (await this.users.findAllByTenant(tenantId)).filter((u) => u.customRoleId === roleId);
  }

  private async notifyHolders(tenantId: string, roleId: string) {
    for (const holder of await this.holders(tenantId, roleId)) this.changes.changed(holder.id);
  }

  private async auditUser(actor: Actor, target: { id: string; email: string }, summary: string, metadata: Record<string, unknown>) {
    await this.activity.record({
      tenantId: actor.tenantId,
      service: 'auth',
      action: 'tenant_role.assigned',
      entityType: 'user',
      entityId: target.id,
      summary: `${summary}: ${target.email}`,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      metadata,
    });
  }

  private async audit(actor: Actor, action: string, role: TenantRole, summary: string, extra: Record<string, unknown> = {}) {
    await this.activity.record({
      tenantId: actor.tenantId,
      service: 'auth',
      action,
      entityType: 'tenant_role',
      entityId: role.id,
      summary,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      metadata: { name: role.name, permissions: role.permissions, ...extra },
    });
  }
}

function toView(role: TenantRole) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    editable: true,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

/** Platform staff roles: the same rules, over admin-portal permissions and the staff roles. */
@Injectable()
export class SystemRolesUseCases extends TenantRolesUseCases {
  protected override readonly portal = 'admin' as const;
}
