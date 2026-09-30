export enum Role {
  // Internal system roles. Never held by a customer organisation: these govern
  // the platform itself — tenant provisioning, billing, SIM approval, global
  // RBAC. PLATFORM_ADMIN belongs here, not with the fleet provider roles it
  // was once grouped with; that grouping is what led to fleet providers being
  // bootstrapped into it.
  SUPER_ADMIN        = "SUPER_ADMIN",
  SYSTEM_ADMIN       = "SYSTEM_ADMIN",
  PLATFORM_ADMIN     = "PLATFORM_ADMIN",
  // Fonu's governance team: reviews what each tenant's roles grant and
  // schedules permission removals. Platform admins cannot.
  GOVERNANCE_OFFICER = "GOVERNANCE_OFFICER",
  // Field installers. Held in the system tenant with their own portal, but
  // not platform staff: never in SYSTEM_ROLES.
  INSTALLER          = "INSTALLER",

  // Stakeholder organisation roles. One per organisation type.
  ENTERPRISE_ADMIN   = "ENTERPRISE_ADMIN",
  AGGREGATOR_ADMIN   = "AGGREGATOR_ADMIN",
  OWNER_OPERATOR     = "OWNER_OPERATOR",
  FLEET_ADMIN        = "FLEET_ADMIN",

  // Sub-roles, assigned within a stakeholder organisation.
  OPERATIONS_MANAGER = "OPERATIONS_MANAGER",
  DISPATCHER         = "DISPATCHER",
  FINANCE_VIEWER     = "FINANCE_VIEWER",
}

export const ROLE_IDS: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 9,
  [Role.SYSTEM_ADMIN]: 10,
  [Role.ENTERPRISE_ADMIN]: 1,
  [Role.AGGREGATOR_ADMIN]: 2,
  [Role.OWNER_OPERATOR]: 3,
  [Role.PLATFORM_ADMIN]: 4,
  [Role.FLEET_ADMIN]: 5,
  [Role.OPERATIONS_MANAGER]: 6,
  [Role.DISPATCHER]: 7,
  [Role.FINANCE_VIEWER]: 8,
  [Role.GOVERNANCE_OFFICER]: 11,
  [Role.INSTALLER]: 12,
};

export const ROLE_SEED_ROWS = Object.entries(ROLE_IDS).map(([name, id]) => ({
  id,
  name: name as Role,
}));

export function roleToId(role: string): number {
  const id = ROLE_IDS[role as Role];
  if (!id) {
    throw new Error(`Unknown role: ${role}`);
  }
  return id;
}

export function roleFromId(id: number): Role {
  const match = ROLE_SEED_ROWS.find((role) => role.id === id)?.name;
  if (!match) {
    throw new Error(`Unknown role id: ${id}`);
  }
  return match;
}

/** Roles that govern the platform itself. Only ever held in the system tenant. */
export const SYSTEM_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.PLATFORM_ADMIN,
  Role.GOVERNANCE_OFFICER,
];

/** Roles a customer organisation may hold. */
export const TENANT_ROLES: readonly Role[] = [
  Role.ENTERPRISE_ADMIN,
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.DISPATCHER,
  Role.FINANCE_VIEWER,
];

export function isSystemRole(role: string): boolean {
  return (SYSTEM_ROLES as readonly string[]).includes(role);
}

export function isTenantRole(role: string): boolean {
  return (TENANT_ROLES as readonly string[]).includes(role);
}

/**
 * The organisation type whose first user is an OWNER_OPERATOR. There the role is
 * the organisation's own owner. In every other organisation type it is held by
 * an independent operator the organisation has invited in.
 */
export const OWNER_OPERATOR_ORGANISATION_TYPE = "owner_operator";

export const MULTI_STAKEHOLDER_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
] as const;

export const FLEET_PROVIDER_ROLES = [
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.DISPATCHER,
  Role.FINANCE_VIEWER,
] as const;

export const INVITABLE_ROLES = [
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.DISPATCHER,
  Role.FINANCE_VIEWER,
] as const;

const LEGACY_ROLE_ALIASES: Record<string, string> = {
  super_admin: Role.SUPER_ADMIN,
  system_admin: Role.SYSTEM_ADMIN,
  admin: Role.ENTERPRISE_ADMIN,
  enterprise_admin: Role.ENTERPRISE_ADMIN,
  aggregator_admin: Role.AGGREGATOR_ADMIN,
  owner_operator: Role.OWNER_OPERATOR,
  platform_admin: Role.PLATFORM_ADMIN,
  fleet_admin: Role.FLEET_ADMIN,
  fleet_manager: Role.FLEET_ADMIN,
  operations_manager: Role.OPERATIONS_MANAGER,
  dispatcher: Role.DISPATCHER,
  finance_viewer: Role.FINANCE_VIEWER,
};

export function normalizeRole(role?: string | null): string | null {
  if (!role) {
    return null;
  }

  const trimmedRole = role.trim();
  if (!trimmedRole) {
    return null;
  }

  const upperRole = trimmedRole.toUpperCase();
  if (upperRole in ROLE_IDS) {
    return upperRole;
  }

  return LEGACY_ROLE_ALIASES[trimmedRole.toLowerCase()] ?? trimmedRole;
}
