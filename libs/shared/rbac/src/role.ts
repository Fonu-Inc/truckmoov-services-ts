export enum Role {
  // Multi-Stakeholder Roles
  ENTERPRISE_ADMIN   = "ENTERPRISE_ADMIN",
  AGGREGATOR_ADMIN   = "AGGREGATOR_ADMIN",
  OWNER_OPERATOR     = "OWNER_OPERATOR",

  // Fleet Provider Roles
  PLATFORM_ADMIN     = "PLATFORM_ADMIN",
  FLEET_ADMIN        = "FLEET_ADMIN",
  OPERATIONS_MANAGER = "OPERATIONS_MANAGER",
  DISPATCHER         = "DISPATCHER",
  FINANCE_VIEWER     = "FINANCE_VIEWER",
}

export const ROLE_IDS: Record<Role, number> = {
  [Role.ENTERPRISE_ADMIN]: 1,
  [Role.AGGREGATOR_ADMIN]: 2,
  [Role.OWNER_OPERATOR]: 3,
  [Role.PLATFORM_ADMIN]: 4,
  [Role.FLEET_ADMIN]: 5,
  [Role.OPERATIONS_MANAGER]: 6,
  [Role.DISPATCHER]: 7,
  [Role.FINANCE_VIEWER]: 8,
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

export const MULTI_STAKEHOLDER_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
] as const;

export const FLEET_PROVIDER_ROLES = [
  Role.PLATFORM_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.DISPATCHER,
  Role.FINANCE_VIEWER,
] as const;

export const INVITABLE_ROLES = [
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
  Role.PLATFORM_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.DISPATCHER,
  Role.FINANCE_VIEWER,
] as const;
