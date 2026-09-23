import { Role } from "@shared/rbac";
import { permissionsOf, type PermissionKey, type PermissionPortal, type TenantResource } from "./catalog";

/**
 * The roles the system ships with, as bundles of catalog permissions. Which
 * permissions each carries is the governance team's decision, made in code
 * by the tech team; tenants cannot edit these, only build custom roles next
 * to them.
 */
export type PredefinedRole = { portal: PermissionPortal; permissions: readonly PermissionKey[] };

const read = (...resources: TenantResource[]) => resources.map((r) => `tenant.${r}.read` as PermissionKey);
const manage = (...resources: TenantResource[]) => resources.map((r) => `tenant.${r}.manage` as PermissionKey);

const ALL_TENANT = permissionsOf("tenant");
const ALL_ADMIN = permissionsOf("admin");

const OPERATIONS: TenantResource[] = [
  "vehicles", "drivers", "devices", "tracking", "geofences", "alerts", "dispatch",
  "documents", "maintenance", "fuel", "waybills", "messaging", "reports",
];

export const PREDEFINED_ROLES: Readonly<Record<Role, PredefinedRole>> = {
  [Role.SUPER_ADMIN]: { portal: "admin", permissions: ALL_ADMIN },
  [Role.SYSTEM_ADMIN]: {
    portal: "admin",
    permissions: ALL_ADMIN.filter((p) => p !== "admin.staff.manage" && !p.startsWith("admin.governance.")),
  },
  [Role.PLATFORM_ADMIN]: {
    portal: "admin",
    permissions: [
      "admin.dashboard.read", "admin.tenants.read", "admin.upgrade_review.read", "admin.upgrade_review.manage",
      "admin.billing.read", "admin.billing.manage", "admin.alerts.read", "admin.alerts.manage",
      "admin.devices.read", "admin.sims.read", "admin.support.read", "admin.support.manage",
    ],
  },

  // Each organisation type's owner runs the whole organisation.
  [Role.ENTERPRISE_ADMIN]: { portal: "tenant", permissions: ALL_TENANT },
  [Role.FLEET_ADMIN]: { portal: "tenant", permissions: ALL_TENANT },
  [Role.AGGREGATOR_ADMIN]: { portal: "tenant", permissions: ALL_TENANT },
  [Role.OWNER_OPERATOR]: { portal: "tenant", permissions: ALL_TENANT },

  [Role.OPERATIONS_MANAGER]: {
    portal: "tenant",
    permissions: [
      ...read(...OPERATIONS, "organization", "activity", "aggregator", "invoicing", "financials", "wallet", "bundles", "sims"),
      ...manage(...OPERATIONS, "aggregator"),
    ],
  },
  [Role.DISPATCHER]: {
    portal: "tenant",
    permissions: [
      ...read("vehicles", "drivers", "devices", "tracking", "geofences", "alerts", "dispatch", "documents", "waybills", "messaging", "profile_dispatch"),
      ...manage("dispatch", "tracking", "alerts", "waybills", "messaging", "profile_dispatch"),
    ],
  },
  [Role.FINANCE_VIEWER]: {
    portal: "tenant",
    permissions: read("invoicing", "financials", "reports", "fuel", "wallet", "bundles", "vehicles", "dispatch"),
  },
};

export function predefinedRole(role: string): PredefinedRole | null {
  return (PREDEFINED_ROLES as Record<string, PredefinedRole>)[role] ?? null;
}
