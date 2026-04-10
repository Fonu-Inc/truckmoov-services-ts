export const TENANT_ORGANIZATION_TYPES = [
  'fleet_provider',
  'enterprise',
  'aggregator',
  'owner_operator',
] as const;

export const TENANT_BILLING_CYCLES = ['monthly', 'yearly'] as const;

export const DEFAULT_DEVICE_MANUFACTURERS = [
  'Teltonika',
  'Queclink',
  'Meitrack',
  'CalAmp',
] as const;

export const SIM_CARRIERS = ['MTN', 'Airtel', 'Glo', '9mobile'] as const;

export const SIM_DATA_PACKAGES = [
  '250MB/month',
  '500MB/month',
  '1GB/month',
  '2GB/month',
] as const;

export type TenantOrganizationType = (typeof TENANT_ORGANIZATION_TYPES)[number];
export type TenantBillingCycle = (typeof TENANT_BILLING_CYCLES)[number];
export type SimCarrier = (typeof SIM_CARRIERS)[number];
export type SimDataPackage = (typeof SIM_DATA_PACKAGES)[number];

export type TenantCompanyDetails = {
  companyName: string;
  email: string;
  phoneNumber: string | null;
  billingEmail: string | null;
  businessAddress: string | null;
  organizationType: TenantOrganizationType;
};

export type TenantSubscriptionSelection = {
  planCode: string;
  billingCycle: TenantBillingCycle;
};

export type TenantDeviceProvisioning = {
  provisionNow: boolean;
  numberOfDevices: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
};

export type TenantSimAssignment = {
  provisionNow: boolean;
  numberOfSims: number | null;
  carrier: SimCarrier | null;
  dataPackage: SimDataPackage | null;
};

export type TenantFeatureFlags = {
  liveTracking: boolean;
  messaging: boolean;
  geofencing: boolean;
  routeOptimization: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
};

export const DEFAULT_TENANT_FEATURES: TenantFeatureFlags = {
  liveTracking: true,
  messaging: true,
  geofencing: false,
  routeOptimization: false,
  advancedAnalytics: false,
  apiAccess: false,
};

export type StoredTenantOnboarding = {
  id: string;
  tenantId: string;
  invitedEmail: string;
  organizationType: TenantOrganizationType;
  bootstrapRole: string;
  status: 'pending_activation' | 'managed';
  company: TenantCompanyDetails;
  subscription: TenantSubscriptionSelection;
  deviceProvisioning: TenantDeviceProvisioning;
  simAssignment: TenantSimAssignment;
  features: TenantFeatureFlags;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface TenantOnboardingRepository {
  save(onboarding: StoredTenantOnboarding): Promise<void>;
  findByTenantId(tenantId: string): Promise<StoredTenantOnboarding | null>;
  findAll(): Promise<StoredTenantOnboarding[]>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const TENANT_ONBOARDING_REPOSITORY = Symbol(
  'TENANT_ONBOARDING_REPOSITORY',
);
