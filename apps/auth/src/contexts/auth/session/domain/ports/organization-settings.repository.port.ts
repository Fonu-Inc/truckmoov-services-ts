export type OrganizationBranding = {
  organizationName: string;
  contactEmail: string | null;
  billingEmail: string | null;
  phoneNumber: string | null;
  address: string | null;
  logoUrl: string | null;
  profilePictureUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  successColor: string | null;
  warningColor: string | null;
  destructiveColor: string | null;
  sidebarBackground: string | null;
  sidebarText: string | null;
  sidebarAccent: string | null;
};

export type OrganizationDefaults = {
  timezone: string;
  language: string;
  currency: string;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  weekStartsOn: 'monday' | 'sunday';
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
      organizationName: 'Truckmoov Tenant',
      contactEmail: null,
      billingEmail: null,
      phoneNumber: null,
      address: null,
      logoUrl: null,
      profilePictureUrl: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      successColor: null,
      warningColor: null,
      destructiveColor: null,
      sidebarBackground: null,
      sidebarText: null,
      sidebarAccent: null,
    },
    defaults: {
      timezone: 'UTC',
      language: 'en',
      // The platform is Naira only. A tenant that never opened its settings
      // reported USD here, which labelled every Naira figure as dollars.
      currency: 'NGN',
      dateFormat: 'YYYY-MM-DD',
      weekStartsOn: 'monday',
    },
  };
}

export interface OrganizationSettingsRepository {
  findByTenantId(tenantId: string): Promise<OrganizationSettings | null>;
  save(settings: OrganizationSettings): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const ORGANIZATION_SETTINGS_REPOSITORY = Symbol(
  'ORGANIZATION_SETTINGS_REPOSITORY',
);
