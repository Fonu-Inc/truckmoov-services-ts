import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import {
  SYSTEM_DEVICE_CATALOG_STATUSES,
  SYSTEM_DEVICE_FEATURE_KEYS,
  SYSTEM_DEVICE_PROTOCOL_TYPES,
} from '../device-model-catalog.repository';
import {
  SIM_CARRIERS,
  SIM_DATA_PACKAGES,
  TENANT_BILLING_CYCLES,
  TENANT_ORGANIZATION_TYPES,
} from '../tenant-onboarding.repository';

export class SessionSchema {
  /** JWT access token */
  accessToken!: string;
  /** JWT refresh token */
  refreshToken!: string;
}

export class AuthResponse extends StandardApiResponse<SessionSchema> {
  @ApiProperty({ type: SessionSchema })
  data!: SessionSchema;
}

export class MeResponse extends StandardApiResponse<Record<string, unknown>> {
  @ApiProperty({ type: 'object', additionalProperties: true })
  data!: Record<string, unknown>;
}

export class HealthResponse extends StandardApiResponse<{
  service: string;
  persistenceBackend: string;
  database: 'up' | 'n/a';
}> {
  @ApiProperty({
    type: 'object',
    properties: {
      service: { type: 'string' },
      persistenceBackend: { type: 'string' },
      database: { type: 'string', enum: ['up', 'n/a'] },
    },
  })
  data!: {
    service: string;
    persistenceBackend: string;
    database: 'up' | 'n/a';
  };
}

export class UploadedMediaSchema {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  size!: number;
}

export class UploadedMediaResponse extends StandardApiResponse<UploadedMediaSchema> {
  @ApiProperty({ type: UploadedMediaSchema })
  data!: UploadedMediaSchema;
}

export class UserProfileSchema {
  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  profilePictureUrl!: string | null;
}

export class ProfileDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ enum: ['enabled', 'disabled'] })
  accountStatus!: 'enabled' | 'disabled';

  @ApiProperty({ type: UserProfileSchema })
  profile!: UserProfileSchema;
}

export class ProfileResponse extends StandardApiResponse<ProfileDataSchema> {
  @ApiProperty({ type: ProfileDataSchema })
  data!: ProfileDataSchema;
}

export class OrganizationUserSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ enum: ['enabled', 'disabled'] })
  accountStatus!: 'enabled' | 'disabled';

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastActiveAt!: string | null;

  @ApiProperty({ type: UserProfileSchema })
  profile!: UserProfileSchema;
}

export class OrganizationUsersDataSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: OrganizationUserSchema, isArray: true })
  users!: OrganizationUserSchema[];
}

export class OrganizationUsersResponse extends StandardApiResponse<OrganizationUsersDataSchema> {
  @ApiProperty({ type: OrganizationUsersDataSchema })
  data!: OrganizationUsersDataSchema;
}

export class OrganizationUserDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty({ type: OrganizationUserSchema })
  user!: OrganizationUserSchema;
}

export class OrganizationUserResponse extends StandardApiResponse<OrganizationUserDataSchema> {
  @ApiProperty({ type: OrganizationUserDataSchema })
  data!: OrganizationUserDataSchema;
}

export class InviteActionDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;
}

export class InviteActionResponse extends StandardApiResponse<InviteActionDataSchema> {
  @ApiProperty({ type: InviteActionDataSchema })
  data!: InviteActionDataSchema;
}

export class RemoveOrganizationUserDataSchema {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;
}

export class RemoveOrganizationUserResponse extends StandardApiResponse<RemoveOrganizationUserDataSchema> {
  @ApiProperty({ type: RemoveOrganizationUserDataSchema })
  data!: RemoveOrganizationUserDataSchema;
}

export class NotificationPreferencesSchema {
  @ApiProperty()
  emailAlerts!: boolean;

  @ApiProperty()
  smsAlerts!: boolean;

  @ApiProperty()
  pushAlerts!: boolean;

  @ApiProperty()
  incidentAlerts!: boolean;

  @ApiProperty()
  jobUpdates!: boolean;

  @ApiProperty()
  marketingAnnouncements!: boolean;
}

export class NotificationPreferencesDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: NotificationPreferencesSchema })
  notificationPreferences!: NotificationPreferencesSchema;
}

export class NotificationPreferencesResponse extends StandardApiResponse<NotificationPreferencesDataSchema> {
  @ApiProperty({ type: NotificationPreferencesDataSchema })
  data!: NotificationPreferencesDataSchema;
}

export class DispatcherPreferencesSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  shiftStart!: string;

  @ApiProperty()
  shiftEnd!: string;

  @ApiProperty({ type: 'number', isArray: true })
  workDays!: number[];
}

export class DispatcherPreferencesDataSchema {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: DispatcherPreferencesSchema })
  dispatcherPreferences!: DispatcherPreferencesSchema;
}

export class DispatcherPreferencesResponse extends StandardApiResponse<DispatcherPreferencesDataSchema> {
  @ApiProperty({ type: DispatcherPreferencesDataSchema })
  data!: DispatcherPreferencesDataSchema;
}

export class OrganizationBrandingSchema {
  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ nullable: true })
  profilePictureUrl!: string | null;

  @ApiProperty({ nullable: true })
  primaryColor!: string | null;

  @ApiProperty({ nullable: true })
  secondaryColor!: string | null;

  @ApiProperty({ nullable: true })
  accentColor!: string | null;

  @ApiProperty({ nullable: true })
  successColor!: string | null;

  @ApiProperty({ nullable: true })
  warningColor!: string | null;

  @ApiProperty({ nullable: true })
  destructiveColor!: string | null;

  @ApiProperty({ nullable: true })
  sidebarBackground!: string | null;

  @ApiProperty({ nullable: true })
  sidebarText!: string | null;

  @ApiProperty({ nullable: true })
  sidebarAccent!: string | null;
}

export class OrganizationDefaultsSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] })
  dateFormat!: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

  @ApiProperty({ enum: ['monday', 'sunday'] })
  weekStartsOn!: 'monday' | 'sunday';
}

export class OrganizationSettingsSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: OrganizationBrandingSchema })
  branding!: OrganizationBrandingSchema;

  @ApiProperty({ type: OrganizationDefaultsSchema })
  defaults!: OrganizationDefaultsSchema;
}

export class OrganizationSettingsResponse extends StandardApiResponse<OrganizationSettingsSchema> {
  @ApiProperty({ type: OrganizationSettingsSchema })
  data!: OrganizationSettingsSchema;
}

export class ActivityLogEntrySchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  service!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  actorId!: string | null;

  @ApiProperty({ nullable: true })
  actorRole!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  recordedAt!: string;
}

export class ActivityLogResponse extends StandardApiResponse<
  ActivityLogEntrySchema[]
> {
  @ApiProperty({ type: ActivityLogEntrySchema, isArray: true })
  data!: ActivityLogEntrySchema[];
}

export class SystemDashboardDataSchema {
  @ApiProperty()
  totalTenants!: number;

  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty()
  totalDrivers!: number;

  @ApiProperty()
  totalSensors!: number;

  @ApiProperty({ nullable: true, type: Number })
  totalSimCards!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  dataUsageTodayMb!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  sensorGpsMessagesPerHour!: number | null;

  @ApiProperty({ type: String, isArray: true })
  unavailableMetrics!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemDashboardResponse extends StandardApiResponse<SystemDashboardDataSchema> {
  @ApiProperty({ type: SystemDashboardDataSchema })
  data!: SystemDashboardDataSchema;
}

export class SystemTenantCompanySchema {
  @ApiProperty()
  companyName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  billingEmail!: string | null;

  @ApiProperty({ nullable: true })
  businessAddress!: string | null;

  @ApiProperty({ enum: TENANT_ORGANIZATION_TYPES })
  organizationType!: (typeof TENANT_ORGANIZATION_TYPES)[number];
}

export class SystemTenantSubscriptionSchema {
  @ApiProperty()
  planCode!: string;

  @ApiProperty({ enum: TENANT_BILLING_CYCLES })
  billingCycle!: (typeof TENANT_BILLING_CYCLES)[number];
}

export class SystemTenantDeviceProvisioningSchema {
  @ApiProperty()
  provisionNow!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  numberOfDevices!: number | null;

  @ApiProperty({ nullable: true })
  deviceManufacturer!: string | null;

  @ApiProperty({ nullable: true })
  deviceModel!: string | null;
}

export class SystemTenantSimAssignmentSchema {
  @ApiProperty()
  provisionNow!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  numberOfSims!: number | null;

  @ApiProperty({ enum: SIM_CARRIERS, nullable: true })
  carrier!: (typeof SIM_CARRIERS)[number] | null;

  @ApiProperty({ enum: SIM_DATA_PACKAGES, nullable: true })
  dataPackage!: (typeof SIM_DATA_PACKAGES)[number] | null;
}

export class SystemTenantFeaturesSchema {
  @ApiProperty()
  liveTracking!: boolean;

  @ApiProperty()
  messaging!: boolean;

  @ApiProperty()
  geofencing!: boolean;

  @ApiProperty()
  routeOptimization!: boolean;

  @ApiProperty()
  advancedAnalytics!: boolean;

  @ApiProperty()
  apiAccess!: boolean;
}

export class SystemTenantOnboardingDataSchema {
  @ApiProperty()
  onboardingId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ enum: ['pending_activation', 'managed'] })
  status!: 'pending_activation' | 'managed';

  @ApiProperty()
  bootstrapRole!: string;

  @ApiProperty({ type: SystemTenantCompanySchema })
  company!: SystemTenantCompanySchema;

  @ApiProperty({ type: SystemTenantSubscriptionSchema })
  subscription!: SystemTenantSubscriptionSchema;

  @ApiProperty({ type: SystemTenantDeviceProvisioningSchema })
  deviceProvisioning!: SystemTenantDeviceProvisioningSchema;

  @ApiProperty({ type: SystemTenantSimAssignmentSchema })
  simAssignment!: SystemTenantSimAssignmentSchema;

  @ApiProperty({ type: SystemTenantFeaturesSchema })
  features!: SystemTenantFeaturesSchema;

  @ApiProperty()
  adminInviteEmail!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SystemTenantOnboardingResponse extends StandardApiResponse<SystemTenantOnboardingDataSchema> {
  @ApiProperty({ type: SystemTenantOnboardingDataSchema })
  data!: SystemTenantOnboardingDataSchema;
}

export class SystemTenantsSummaryDataSchema {
  @ApiProperty()
  totalTenants!: number;

  @ApiProperty()
  activeTenants!: number;

  @ApiProperty()
  monthlyRevenueNgn!: number;

  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemTenantsSummaryResponse extends StandardApiResponse<SystemTenantsSummaryDataSchema> {
  @ApiProperty({ type: SystemTenantsSummaryDataSchema })
  data!: SystemTenantsSummaryDataSchema;
}

export class SystemTenantInvitationStatusSchema {
  @ApiProperty()
  hasPendingInvitation!: boolean;

  @ApiProperty()
  invitationAccepted!: boolean;
}

export class SystemTenantBusinessInfoSchema {
  @ApiProperty()
  companyName!: string;

  @ApiProperty({ nullable: true })
  registrationNumber!: string | null;

  @ApiProperty({ nullable: true })
  taxId!: string | null;

  @ApiProperty({ nullable: true })
  businessType!: string | null;

  @ApiProperty({ nullable: true })
  industry!: string | null;

  @ApiProperty({ nullable: true })
  addressLine1!: string | null;

  @ApiProperty({ nullable: true })
  addressLine2!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  state!: string | null;

  @ApiProperty({ nullable: true })
  postalCode!: string | null;

  @ApiProperty({ nullable: true })
  country!: string | null;

  @ApiProperty({
    enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected'],
  })
  verificationStatus!:
    | 'not_submitted'
    | 'pending'
    | 'under_review'
    | 'verified'
    | 'rejected';

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  verifiedAt!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  yearEstablished!: number | null;
}

export class SystemTenantListItemSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  address!: string | null;

  @ApiProperty({ nullable: true })
  billingEmail!: string | null;

  @ApiProperty({ enum: ['starter', 'professional', 'enterprise'] })
  plan!: 'starter' | 'professional' | 'enterprise';

  @ApiProperty({ nullable: true })
  planCode!: string | null;

  @ApiProperty({ enum: ['active', 'pending', 'suspended', 'inactive'] })
  status!: 'active' | 'pending' | 'suspended' | 'inactive';

  @ApiProperty({ enum: TENANT_ORGANIZATION_TYPES, nullable: true })
  organizationType!: (typeof TENANT_ORGANIZATION_TYPES)[number] | null;

  @ApiProperty({ enum: TENANT_ORGANIZATION_TYPES, isArray: true })
  organizationTypes!: (typeof TENANT_ORGANIZATION_TYPES)[number][];

  @ApiProperty()
  vehicleCount!: number;

  @ApiProperty()
  driverCount!: number;

  @ApiProperty()
  deviceCount!: number;

  @ApiProperty()
  simCount!: number;

  @ApiProperty()
  monthlyRevenueNgn!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastActiveAt!: string | null;

  @ApiProperty({ type: SystemTenantFeaturesSchema })
  features!: SystemTenantFeaturesSchema;

  @ApiProperty({ type: SystemTenantInvitationStatusSchema })
  invitationStatus!: SystemTenantInvitationStatusSchema;

  @ApiProperty({ type: SystemTenantBusinessInfoSchema })
  businessInfo!: SystemTenantBusinessInfoSchema;
}

export class SystemTenantsListDataSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: SystemTenantListItemSchema, isArray: true })
  tenants!: SystemTenantListItemSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemTenantsListResponse extends StandardApiResponse<SystemTenantsListDataSchema> {
  @ApiProperty({ type: SystemTenantsListDataSchema })
  data!: SystemTenantsListDataSchema;
}

export class SystemTenantDetailDataSchema {
  @ApiProperty({ type: SystemTenantListItemSchema })
  tenant!: SystemTenantListItemSchema;

  @ApiProperty({ type: SystemTenantOnboardingDataSchema, nullable: true })
  onboarding!: SystemTenantOnboardingDataSchema | null;
}

export class SystemTenantDetailResponse extends StandardApiResponse<SystemTenantDetailDataSchema> {
  @ApiProperty({ type: SystemTenantDetailDataSchema })
  data!: SystemTenantDetailDataSchema;
}

export class SystemTenantFeatureOptionSchema {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  defaultEnabled!: boolean;
}

export class SystemOnboardingDeviceCatalogModelSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: SYSTEM_DEVICE_PROTOCOL_TYPES })
  protocolType!: (typeof SYSTEM_DEVICE_PROTOCOL_TYPES)[number];

  @ApiProperty({ nullable: true, type: Number })
  defaultPort!: number | null;

  @ApiProperty({ enum: SYSTEM_DEVICE_FEATURE_KEYS, isArray: true })
  supportedFeatures!: (typeof SYSTEM_DEVICE_FEATURE_KEYS)[number][];
}

export class SystemOnboardingDeviceCatalogManufacturerSchema {
  @ApiProperty()
  manufacturer!: string;

  @ApiProperty({
    type: SystemOnboardingDeviceCatalogModelSchema,
    isArray: true,
  })
  models!: SystemOnboardingDeviceCatalogModelSchema[];
}

export class SystemTenantOnboardingReferenceDataSchema {
  @ApiProperty({ enum: TENANT_ORGANIZATION_TYPES, isArray: true })
  organizationTypes!: (typeof TENANT_ORGANIZATION_TYPES)[number][];

  @ApiProperty({ enum: TENANT_BILLING_CYCLES, isArray: true })
  billingCycles!: (typeof TENANT_BILLING_CYCLES)[number][];

  @ApiProperty({ type: String, isArray: true })
  deviceManufacturers!: string[];

  @ApiProperty({
    type: SystemOnboardingDeviceCatalogManufacturerSchema,
    isArray: true,
  })
  deviceCatalog!: SystemOnboardingDeviceCatalogManufacturerSchema[];

  @ApiProperty({ enum: SIM_CARRIERS, isArray: true })
  simCarriers!: (typeof SIM_CARRIERS)[number][];

  @ApiProperty({ enum: SIM_DATA_PACKAGES, isArray: true })
  simDataPackages!: (typeof SIM_DATA_PACKAGES)[number][];

  @ApiProperty({
    enum: ['active', 'pending', 'suspended', 'inactive'],
    isArray: true,
  })
  tenantStatuses!: Array<'active' | 'pending' | 'suspended' | 'inactive'>;

  @ApiProperty({
    enum: ['starter', 'professional', 'enterprise'],
    isArray: true,
  })
  tenantPlans!: Array<'starter' | 'professional' | 'enterprise'>;

  @ApiProperty({ type: SystemTenantFeaturesSchema })
  featureDefaults!: SystemTenantFeaturesSchema;

  @ApiProperty({ type: SystemTenantFeatureOptionSchema, isArray: true })
  featureOptions!: SystemTenantFeatureOptionSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemTenantOnboardingReferenceDataResponse extends StandardApiResponse<SystemTenantOnboardingReferenceDataSchema> {
  @ApiProperty({ type: SystemTenantOnboardingReferenceDataSchema })
  data!: SystemTenantOnboardingReferenceDataSchema;
}

export class SystemSubscriptionPlanSchema {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['starter', 'professional', 'enterprise'] })
  tier!: 'starter' | 'professional' | 'enterprise';

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ nullable: true, type: Number })
  monthlyPriceNgn!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  yearlyMonthlyEquivalentNgn!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  yearlyDiscountPercent!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  maxActiveVehicles!: number | null;

  @ApiProperty()
  customPricing!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  trialDays!: number | null;

  @ApiProperty({ nullable: true })
  badge!: string | null;

  @ApiProperty()
  ctaLabel!: string;

  @ApiProperty({ type: String, isArray: true })
  features!: string[];
}

export class SystemSubscriptionPlansDataSchema {
  @ApiProperty({ type: SystemSubscriptionPlanSchema, isArray: true })
  plans!: SystemSubscriptionPlanSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemSubscriptionPlansResponse extends StandardApiResponse<SystemSubscriptionPlansDataSchema> {
  @ApiProperty({ type: SystemSubscriptionPlansDataSchema })
  data!: SystemSubscriptionPlansDataSchema;
}

export class SystemTenantDeleteDataSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  deleted!: boolean;
}

export class SystemTenantDeleteResponse extends StandardApiResponse<SystemTenantDeleteDataSchema> {
  @ApiProperty({ type: SystemTenantDeleteDataSchema })
  data!: SystemTenantDeleteDataSchema;
}

export class SystemDeviceCatalogModelSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: SYSTEM_DEVICE_PROTOCOL_TYPES })
  protocolType!: (typeof SYSTEM_DEVICE_PROTOCOL_TYPES)[number];

  @ApiProperty({ nullable: true, type: Number })
  defaultPort!: number | null;

  @ApiProperty({ enum: SYSTEM_DEVICE_FEATURE_KEYS, isArray: true })
  supportedFeatures!: (typeof SYSTEM_DEVICE_FEATURE_KEYS)[number][];

  @ApiProperty({ enum: SYSTEM_DEVICE_CATALOG_STATUSES })
  status!: (typeof SYSTEM_DEVICE_CATALOG_STATUSES)[number];

  @ApiProperty({ nullable: true })
  configurationInstructions!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SystemDeviceCatalogListDataSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: SystemDeviceCatalogModelSchema, isArray: true })
  models!: SystemDeviceCatalogModelSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemDeviceCatalogListResponse extends StandardApiResponse<SystemDeviceCatalogListDataSchema> {
  @ApiProperty({ type: SystemDeviceCatalogListDataSchema })
  data!: SystemDeviceCatalogListDataSchema;
}

export class SystemDeviceCatalogModelResponse extends StandardApiResponse<SystemDeviceCatalogModelSchema> {
  @ApiProperty({ type: SystemDeviceCatalogModelSchema })
  data!: SystemDeviceCatalogModelSchema;
}

export class SystemDeviceCatalogDeleteDataSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  deleted!: boolean;
}

export class SystemDeviceCatalogDeleteResponse extends StandardApiResponse<SystemDeviceCatalogDeleteDataSchema> {
  @ApiProperty({ type: SystemDeviceCatalogDeleteDataSchema })
  data!: SystemDeviceCatalogDeleteDataSchema;
}

export class SystemDeviceCatalogFeatureOptionSchema {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;
}

export class SystemDeviceCatalogReferenceDataSchema {
  @ApiProperty({ enum: SYSTEM_DEVICE_PROTOCOL_TYPES, isArray: true })
  protocolTypes!: (typeof SYSTEM_DEVICE_PROTOCOL_TYPES)[number][];

  @ApiProperty({ enum: SYSTEM_DEVICE_CATALOG_STATUSES, isArray: true })
  statuses!: (typeof SYSTEM_DEVICE_CATALOG_STATUSES)[number][];

  @ApiProperty({ type: SystemDeviceCatalogFeatureOptionSchema, isArray: true })
  featureOptions!: SystemDeviceCatalogFeatureOptionSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemDeviceCatalogReferenceDataResponse extends StandardApiResponse<SystemDeviceCatalogReferenceDataSchema> {
  @ApiProperty({ type: SystemDeviceCatalogReferenceDataSchema })
  data!: SystemDeviceCatalogReferenceDataSchema;
}

export class SystemDeviceInventoryItemSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  imei!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty()
  lifecycleStatus!: string;

  @ApiProperty()
  operationalStatus!: string;

  @ApiProperty({ nullable: true, type: Number })
  signalStrength!: number | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastSeen!: string | null;

  @ApiProperty({ nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  assignedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SystemDeviceInventoryListDataSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: SystemDeviceInventoryItemSchema, isArray: true })
  devices!: SystemDeviceInventoryItemSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemDeviceInventoryListResponse extends StandardApiResponse<SystemDeviceInventoryListDataSchema> {
  @ApiProperty({ type: SystemDeviceInventoryListDataSchema })
  data!: SystemDeviceInventoryListDataSchema;
}

export class SystemDeviceSummaryDataSchema {
  @ApiProperty()
  totalDevices!: number;

  @ApiProperty()
  registeredDevices!: number;

  @ApiProperty()
  configuredDevices!: number;

  @ApiProperty()
  verifiedActiveDevices!: number;

  @ApiProperty()
  pendingConfigDevices!: number;

  @ApiProperty()
  onlineNowDevices!: number;

  @ApiProperty()
  assignableDevices!: number;

  @ApiProperty()
  assignedDevices!: number;

  @ApiProperty()
  activeDevices!: number;

  @ApiProperty()
  faultyDevices!: number;

  @ApiProperty()
  totalCatalogModels!: number;

  @ApiProperty()
  supportedCatalogModels!: number;

  @ApiProperty()
  deprecatedCatalogModels!: number;

  @ApiProperty()
  blockedCatalogModels!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemDeviceSummaryResponse extends StandardApiResponse<SystemDeviceSummaryDataSchema> {
  @ApiProperty({ type: SystemDeviceSummaryDataSchema })
  data!: SystemDeviceSummaryDataSchema;
}
