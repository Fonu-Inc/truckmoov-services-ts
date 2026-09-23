import { Permission } from "./permission";
import { Role } from "./role";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.SYSTEM_ADMIN]: [],
  [Role.GOVERNANCE_OFFICER]: [],
  [Role.ENTERPRISE_ADMIN]: Object.values(Permission),

  [Role.AGGREGATOR_ADMIN]: [
    Permission.USER_READ,
    Permission.VEHICLE_READ,
    Permission.DRIVER_READ, Permission.DRIVER_CREATE, Permission.DRIVER_UPDATE,
    Permission.DEVICE_READ,
    Permission.JOB_READ,
    Permission.OFFER_READ,
  ],

  [Role.OWNER_OPERATOR]: [
    Permission.OFFER_READ, Permission.OFFER_UPDATE,
    Permission.JOB_READ,
    Permission.VEHICLE_READ,
    Permission.DRIVER_READ,
    Permission.DEVICE_READ,
  ],

  [Role.PLATFORM_ADMIN]: [
    Permission.USER_READ,
    Permission.DEVICE_READ,
    Permission.VEHICLE_READ,
    Permission.DRIVER_READ,
    Permission.JOB_READ,
    Permission.FINANCE_READ,
  ],

  [Role.FLEET_ADMIN]: [
    Permission.VEHICLE_CREATE, Permission.VEHICLE_READ, Permission.VEHICLE_UPDATE, Permission.VEHICLE_DELETE,
    Permission.DRIVER_CREATE, Permission.DRIVER_READ, Permission.DRIVER_UPDATE, Permission.DRIVER_DELETE,
    Permission.DEVICE_CREATE, Permission.DEVICE_READ, Permission.DEVICE_UPDATE, Permission.DEVICE_DELETE,
    Permission.JOB_READ, Permission.JOB_UPDATE,
  ],

  [Role.OPERATIONS_MANAGER]: [
    Permission.VEHICLE_CREATE, Permission.VEHICLE_READ, Permission.VEHICLE_UPDATE, Permission.VEHICLE_DELETE,
    Permission.DRIVER_CREATE, Permission.DRIVER_READ, Permission.DRIVER_UPDATE, Permission.DRIVER_DELETE,
    Permission.DEVICE_CREATE, Permission.DEVICE_READ, Permission.DEVICE_UPDATE, Permission.DEVICE_DELETE,
    Permission.JOB_CREATE, Permission.JOB_READ, Permission.JOB_UPDATE, Permission.JOB_DELETE,
  ],

  [Role.DISPATCHER]: [
    Permission.DEVICE_READ,
    Permission.VEHICLE_READ,
    Permission.DRIVER_READ,
    Permission.JOB_READ,
  ],

  [Role.FINANCE_VIEWER]: [
    Permission.DEVICE_READ,
    Permission.FINANCE_READ,
  ],
};

const ROLE_INHERITANCE: Partial<Record<Role, Role[]>> = {
  [Role.OPERATIONS_MANAGER]: [Role.DISPATCHER],
  [Role.FLEET_ADMIN]: [Role.OPERATIONS_MANAGER, Role.DISPATCHER, Role.FINANCE_VIEWER],
  [Role.PLATFORM_ADMIN]: [Role.FINANCE_VIEWER],
};

export function hasPermission(role: Role, perm: Permission): boolean {
  const visited = new Set<Role>();
  const stack: Role[] = [role];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (ROLE_PERMISSIONS[current]?.includes(perm)) {
      return true;
    }

    for (const inherited of ROLE_INHERITANCE[current] ?? []) {
      stack.push(inherited);
    }
  }

  return false;
}
