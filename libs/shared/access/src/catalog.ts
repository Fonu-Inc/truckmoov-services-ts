import type { Portal } from "@shared/identity";

/**
 * Every permission the platform has. Defined here and nowhere else: nobody
 * creates one at runtime. Each belongs to exactly one portal, which is what
 * stops a tenant role from ever holding an admin-portal permission.
 *
 * A resource has two actions: read, and manage (anything that changes it).
 */
export type PermissionPortal = Portal;

const TENANT_RESOURCES = {
  organization: "The organisation's users, invites and settings",
  roles: "The organisation's custom roles",
  activity: "The organisation's activity log",
  profile_dispatch: "Dispatcher working hours",
  mailbox: "The shared mailbox",
  support: "Support tickets to Fonu",
  wallet: "The communications wallet and its spending limits",
  bundles: "Data bundles for the organisation's SIMs",
  sims: "The organisation's SIM cards",
  onboarding: "Onboarding, KYC documents and the installation booking",
  upgrades: "Requests to change organisation type",
  vehicles: "Vehicles",
  drivers: "Drivers",
  devices: "Tracking devices, their setup and installation",
  tracking: "Live tracking, trips and share links",
  geofences: "Geofences and their alerts",
  alerts: "Alerts",
  dispatch: "Dispatch jobs, routes and job offers",
  aggregator: "Aggregator operators, sub-dispatch and settlements",
  documents: "Documents and compliance",
  maintenance: "Maintenance",
  fuel: "Fuel records and budgets",
  waybills: "Waybills",
  invoicing: "Invoices and invoice settings",
  financials: "Financial reports and configuration",
  reports: "Reports and analytics",
  messaging: "Messages, WhatsApp and campaigns",
} as const;

const ADMIN_RESOURCES = {
  staff: "Platform staff accounts and invites",
  governance: "Tenant roles and scheduled permission removals",
  tenants: "Tenant organisations",
  onboarding_review: "Onboarding applications and KYC review",
  upgrade_review: "Organisation type change requests",
  plans: "Subscription plans and entitlements",
  billing: "Platform billing, wallets and communication rates",
  devices: "The device catalog and inventory",
  sims: "SIM stock, batches and requests",
  support: "Support tickets from tenants",
  security: "Security events, IP blocking and auth events",
  settings: "Platform settings, feature flags and reference data",
  integrations: "Third-party integration credentials",
  alerts: "Platform alert settings",
  ai: "AI governance",
  audit: "The platform audit log",
  installers: "Field installers and their invites",
  installations: "Installation jobs and the devices bound to them",
  messaging: "The platform WhatsApp Business number, its templates and its inbox",
  dashboard: "Platform dashboard and health",
} as const;

export type TenantResource = keyof typeof TENANT_RESOURCES;
export type AdminResource = keyof typeof ADMIN_RESOURCES;
export type PermissionAction = "read" | "manage";
export type PermissionKey =
  | `tenant.${TenantResource}.${PermissionAction}`
  | `admin.${AdminResource}.${PermissionAction}`;

export type PermissionEntry = { key: PermissionKey; portal: PermissionPortal; description: string };

function entries(portal: PermissionPortal, resources: Record<string, string>): PermissionEntry[] {
  return Object.entries(resources).flatMap(([resource, what]) => [
    { key: `${portal}.${resource}.read` as PermissionKey, portal, description: `See: ${what}` },
    { key: `${portal}.${resource}.manage` as PermissionKey, portal, description: `Change: ${what}` },
  ]);
}

export const PERMISSION_CATALOG: readonly PermissionEntry[] = [
  ...entries("tenant", TENANT_RESOURCES),
  ...entries("admin", ADMIN_RESOURCES),
];

const BY_KEY = new Map(PERMISSION_CATALOG.map((entry) => [entry.key, entry]));

export function isPermission(key: string): key is PermissionKey {
  return BY_KEY.has(key as PermissionKey);
}

export function portalOfPermission(key: PermissionKey): PermissionPortal {
  return BY_KEY.get(key)!.portal;
}

export function permissionsOf(portal: PermissionPortal): PermissionKey[] {
  return PERMISSION_CATALOG.filter((entry) => entry.portal === portal).map((entry) => entry.key);
}
