export type OrganizationBranding = {
  organizationName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

export type OrganizationDefaults = {
  timezone: string;
  currency: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  weekStartsOn: "monday" | "sunday";
};

export type OrganizationSettings = {
  tenantId: string;
  branding: OrganizationBranding;
  defaults: OrganizationDefaults;
};

export function buildDefaultOrganizationSettings(
  tenantId: string,
): OrganizationSettings {
  return {
    tenantId,
    branding: {
      organizationName: "Truckmoov Tenant",
      logoUrl: null,
      primaryColor: null,
      secondaryColor: null,
    },
    defaults: {
      timezone: "UTC",
      currency: "USD",
      dateFormat: "YYYY-MM-DD",
      weekStartsOn: "monday",
    },
  };
}

export interface OrganizationSettingsRepository {
  findByTenantId(tenantId: string): Promise<OrganizationSettings | null>;
  save(settings: OrganizationSettings): Promise<void>;
}

export const ORGANIZATION_SETTINGS_REPOSITORY = Symbol(
  "ORGANIZATION_SETTINGS_REPOSITORY",
);
