import { isSystemRole } from "@shared/rbac";

/** The tenant that internal platform staff belong to. */
export const SYSTEM_TENANT_ID = "system";

export type ActorLike = { role: string; tenantId: string };

/** The front end a user signed in through. A token acts only inside its own portal. */
export type Portal = "admin" | "tenant";

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

/** A system role held outside the system tenant. */
export function holdsMisplacedSystemRole(actor: ActorLike): boolean {
  return isSystemRole(actor.role) && actor.tenantId !== SYSTEM_TENANT_ID;
}

/** The portal a user belongs to. */
export function portalFor(actor: ActorLike): Portal {
  return isPlatformActor(actor) ? "admin" : "tenant";
}
