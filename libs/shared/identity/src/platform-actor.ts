import { Role, isSystemRole } from "@shared/rbac";

/** The tenant that internal platform staff belong to. */
export const SYSTEM_TENANT_ID = "system";

export type ActorLike = { role: string; tenantId: string };

/** The front ends a user can sign in through. A token acts only inside its own portal. */
export const PORTALS = ["admin", "tenant", "installer"] as const;

export type Portal = (typeof PORTALS)[number];

export function isPortal(value: unknown): value is Portal {
  return (PORTALS as readonly unknown[]).includes(value);
}

/**
 * Whether the caller is internal platform staff.
 *
 * Both halves are required. A system role held anywhere but the system tenant
 * was granted through a path that should not exist, and must not carry
 * platform power; a system-tenant account without a system role is not staff.
 */
export function isPlatformActor(actor: ActorLike): boolean {
  return actor.tenantId === SYSTEM_TENANT_ID && isSystemRole(actor.role);
}

/** A field installer: held only in the system tenant, and never platform staff. */
export function isInstallerActor(actor: ActorLike): boolean {
  return actor.tenantId === SYSTEM_TENANT_ID && actor.role === Role.INSTALLER;
}

/** A system-tenant-only role (system role or installer) held outside the system tenant. */
export function holdsMisplacedSystemRole(actor: ActorLike): boolean {
  const systemOnly = isSystemRole(actor.role) || actor.role === Role.INSTALLER;
  return systemOnly && actor.tenantId !== SYSTEM_TENANT_ID;
}

/** The portal a user belongs to. */
export function portalFor(actor: ActorLike): Portal {
  if (isPlatformActor(actor)) return "admin";
  if (isInstallerActor(actor)) return "installer";
  return "tenant";
}
