import { SetMetadata } from "@nestjs/common";
import type { PermissionKey, PermissionPortal } from "./catalog";

export const REQUIREMENT_KEY = "truckmoov:requirement";

/** What a caller must hold to use a route. */
export type Requirement =
  | { kind: "permissions"; permissions: PermissionKey[] }
  /** A resource: reading needs its read permission, anything else its manage one. */
  | { kind: "resource"; resource: string }
  /** Any signed-in user of the route's portal, acting on their own account. */
  | { kind: "signed-in" };

/** The route needs every one of these permissions. */
export const Requires = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIREMENT_KEY, { kind: "permissions", permissions } satisfies Requirement);

/**
 * Every route in the controller works on one resource, e.g. "tenant.vehicles":
 * GET and HEAD need tenant.vehicles.read, every other method tenant.vehicles.manage.
 */
export const OnResource = (resource: `${PermissionPortal}.${string}`) =>
  SetMetadata(REQUIREMENT_KEY, { kind: "resource", resource } satisfies Requirement);

/** Self-service: the caller's own profile, session or settings. */
export const SignedIn = () => SetMetadata(REQUIREMENT_KEY, { kind: "signed-in" } satisfies Requirement);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The permissions a request needs under a requirement. Empty means none. */
export function neededPermissions(requirement: Requirement, method: string): PermissionKey[] {
  switch (requirement.kind) {
    case "permissions":
      return requirement.permissions;
    case "resource":
      return [`${requirement.resource}.${READ_METHODS.has(method.toUpperCase()) ? "read" : "manage"}` as PermissionKey];
    case "signed-in":
      return [];
  }
}
