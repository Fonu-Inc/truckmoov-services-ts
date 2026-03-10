import { Permission } from "./permission";
import { Role } from "./role";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ENTERPRISE_ADMIN]: Object.values(Permission),
  [Role.FLEET_MANAGER]: [
    Permission.VEHICLE_CREATE, Permission.VEHICLE_READ,
    Permission.VEHICLE_UPDATE, Permission.VEHICLE_DELETE,
    Permission.DRIVER_CREATE,  Permission.DRIVER_READ,
    Permission.DRIVER_UPDATE,  Permission.DRIVER_DELETE,
  ],
  [Role.OPERATOR]: [
    Permission.VEHICLE_READ,
    Permission.DRIVER_READ,
  ],
};

export function hasPermission(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}
