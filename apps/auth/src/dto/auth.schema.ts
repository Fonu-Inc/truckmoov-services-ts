import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { DEVICE_SETUP_REQUEST_STATUSES, SETUP_REQUEST_CHARGE_KINDS } from '@shared/devices';
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
import { SYSTEM_BACKUP_FREQUENCIES } from '../system-settings.repository';
import {
  SYSTEM_FEATURE_FLAG_CATEGORIES,
  SYSTEM_FEATURE_FLAG_PHASES,
  SYSTEM_FEATURE_FLAG_SCOPES,
} from '../system-feature-flag.repository';

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
  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ nullable: true, enum: ['enabled', 'disabled'] })
  accountStatus!: 'enabled' | 'disabled' | null;

  @ApiProperty({ enum: ['active', 'inactive', 'invited'] })
  status!: 'active' | 'inactive' | 'invited';

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastActiveAt!: string | null;

  @ApiProperty({ nullable: true, type: UserProfileSchema })
  profile!: UserProfileSchema | null;

  @ApiProperty({ enum: ['accepted', 'invited'] })
  inviteStatus!: 'accepted' | 'invited';

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  invitedAt?: string;
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
  smsAlerts!: boolean;

  @ApiProperty()
  pushAlerts!: boolean;

  @ApiProperty()
  incidentAlerts!: boolean;

  @ApiProperty()
  jobAssignment!: boolean;

  @ApiProperty()
  jobCompletion!: boolean;

  @ApiProperty()
  maintenanceReminders!: boolean;

  @ApiProperty()
  fuelAlerts!: boolean;

  @ApiProperty()
  geofenceAlerts!: boolean;

  @ApiProperty()
  emailDigest!: boolean;
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
  suspendedTenants!: number;

  @ApiProperty()
  monthlyRevenueNgn!: number;

  @ApiProperty()
  totalVehicles!: number;

  @ApiProperty()
  totalSims!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null until a billing/invoice source is available.',
  })
  overdueInvoices!: number | null;

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

  @ApiProperty({ nullable: true })
  planName!: string | null;

  @ApiProperty({ description: 'False when no plan is assigned; null quota limits then mean no plan, not unlimited.' })
  planAssigned!: boolean;

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

  @ApiProperty({ description: 'Cash collected this Africa/Lagos month, in naira.' })
  collectedThisMonthNgn!: number;

  @ApiProperty({ description: 'Deprecated alias of collectedThisMonthNgn.' })
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

  @ApiProperty({ nullable: true, type: Number })
  maxUsers!: number | null;

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

  @ApiProperty({ nullable: true, type: String, example: 'GPS Tracker' })
  deviceType!: string | null;

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

export class SystemDeviceDetailSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  imei!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  firmwareVersion!: string | null;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty()
  lifecycleStatus!: string;

  @ApiProperty()
  operationalStatus!: string;

  @ApiProperty({ nullable: true })
  protocol!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  signalStrength!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  batteryLevel!: number | null;

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

export class SystemDeviceDetailResponse extends StandardApiResponse<SystemDeviceDetailSchema> {
  @ApiProperty({ type: SystemDeviceDetailSchema })
  data!: SystemDeviceDetailSchema;
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

export class SystemSettingsDefaultsSchema {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty({
    description:
      'Days before expiry that a compliance document counts as expiring and a reminder is sent',
  })
  complianceReminderDays!: number;
}

export class SystemSettingsFeaturesSchema {
  @ApiProperty()
  allowNewTenantRegistration!: boolean;

  @ApiProperty()
  maintenanceMode!: boolean;

  @ApiProperty()
  enableBetaFeatures!: boolean;
}

export class SystemSettingsRetentionSchema {
  @ApiProperty()
  gpsDataRetentionDays!: number;

  @ApiProperty()
  logRetentionDays!: number;

  @ApiProperty({ enum: SYSTEM_BACKUP_FREQUENCIES })
  backupFrequency!: (typeof SYSTEM_BACKUP_FREQUENCIES)[number];
}

export class SystemSettingsDataSchema {
  @ApiProperty()
  platformName!: string;

  @ApiProperty()
  supportEmail!: string;

  @ApiProperty({ type: SystemSettingsDefaultsSchema })
  defaults!: SystemSettingsDefaultsSchema;

  @ApiProperty({ type: SystemSettingsFeaturesSchema })
  features!: SystemSettingsFeaturesSchema;

  @ApiProperty({ type: SystemSettingsRetentionSchema })
  retention!: SystemSettingsRetentionSchema;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ nullable: true })
  updatedByUserId!: string | null;
}

export class SystemSettingsResponse extends StandardApiResponse<SystemSettingsDataSchema> {
  @ApiProperty({ type: SystemSettingsDataSchema })
  data!: SystemSettingsDataSchema;
}

export class SystemAdminInviteSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  invitedBy!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SystemAdminInvitesDataSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: SystemAdminInviteSchema, isArray: true })
  invites!: SystemAdminInviteSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemAdminInvitesResponse extends StandardApiResponse<SystemAdminInvitesDataSchema> {
  @ApiProperty({ type: SystemAdminInvitesDataSchema })
  data!: SystemAdminInvitesDataSchema;
}

export class SystemAdminInviteResponse extends StandardApiResponse<SystemAdminInviteSchema> {
  @ApiProperty({ type: SystemAdminInviteSchema })
  data!: SystemAdminInviteSchema;
}

export class SystemAdminInviteCancelDataSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  cancelled!: boolean;
}

export class SystemAdminInviteCancelResponse extends StandardApiResponse<SystemAdminInviteCancelDataSchema> {
  @ApiProperty({ type: SystemAdminInviteCancelDataSchema })
  data!: SystemAdminInviteCancelDataSchema;
}

export class SystemTenantInviteActionDataSchema {
  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SystemTenantInviteActionResponse extends StandardApiResponse<SystemTenantInviteActionDataSchema> {
  @ApiProperty({ type: SystemTenantInviteActionDataSchema })
  data!: SystemTenantInviteActionDataSchema;
}

export class SystemFeatureFlagSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SYSTEM_FEATURE_FLAG_SCOPES })
  scope!: (typeof SYSTEM_FEATURE_FLAG_SCOPES)[number];

  @ApiProperty({ nullable: true })
  tenantId!: string | null;

  @ApiProperty()
  featureKey!: string;

  @ApiProperty()
  featureName!: string;

  @ApiProperty({ nullable: true })
  featureDescription!: string | null;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty()
  rolloutPercentage!: number;

  @ApiProperty({ enum: SYSTEM_FEATURE_FLAG_CATEGORIES })
  category!: (typeof SYSTEM_FEATURE_FLAG_CATEGORIES)[number];

  @ApiProperty({ enum: SYSTEM_FEATURE_FLAG_PHASES, nullable: true })
  phase!: (typeof SYSTEM_FEATURE_FLAG_PHASES)[number] | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SystemFeatureFlagsDataSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: SystemFeatureFlagSchema, isArray: true })
  flags!: SystemFeatureFlagSchema[];

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string;
}

export class SystemFeatureFlagsResponse extends StandardApiResponse<SystemFeatureFlagsDataSchema> {
  @ApiProperty({ type: SystemFeatureFlagsDataSchema })
  data!: SystemFeatureFlagsDataSchema;
}

export class SystemFeatureFlagResponse extends StandardApiResponse<SystemFeatureFlagSchema> {
  @ApiProperty({ type: SystemFeatureFlagSchema })
  data!: SystemFeatureFlagSchema;
}

/* ── IoT SIM Schemas ───────────────────────────────── */

export class SystemSimSummaryDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() unassigned!: number;
  @ApiProperty() pendingRequests!: number;
  @ApiProperty() carriers!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } }) byStatus!: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } }) byCarrier!: Record<string, number>;
}

export class SystemSimSummaryResponse extends StandardApiResponse<SystemSimSummaryDataSchema> {
  @ApiProperty({ type: SystemSimSummaryDataSchema })
  data!: SystemSimSummaryDataSchema;
}

export class SystemSimSchema {
  @ApiProperty() id!: string;
  @ApiProperty() iccid!: string;
  @ApiProperty({ nullable: true }) imsi!: string | null;
  @ApiProperty({ nullable: true }) msisdn!: string | null;
  @ApiProperty() carrier!: string;
  @ApiProperty() plan!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) tenantId!: string | null;
  @ApiProperty({ nullable: true }) deviceId!: string | null;
  @ApiProperty({ nullable: true }) deviceImei!: string | null;
  @ApiProperty({ nullable: true }) suspensionReason!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Present on list and export' }) tenantName?: string | null;
  @ApiProperty() dataUsageMb!: number;
  @ApiProperty() dataLimitMb!: number;
  @ApiProperty() smsUsage!: number;
  @ApiProperty() smsLimit!: number;
  @ApiProperty() monthlyCostNgn!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) activationDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiryDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastActivity!: string | null;
  @ApiProperty({ nullable: true }) signalStrength!: number | null;
  @ApiProperty({ nullable: true }) networkType!: string | null;
  @ApiProperty() roaming!: boolean;
  @ApiProperty({ nullable: true }) fonuStatus!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemSimsListDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemSimSchema, isArray: true }) sims!: SystemSimSchema[];
}

export class SystemSimsListResponse extends StandardApiResponse<SystemSimsListDataSchema> {
  @ApiProperty({ type: SystemSimsListDataSchema })
  data!: SystemSimsListDataSchema;
}

export class SystemSimImportRowResultSchema {
  @ApiProperty() row!: number;
  @ApiProperty() iccid!: string;
  @ApiProperty({ enum: ['imported', 'skipped', 'failed'] }) outcome!: string;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty({ nullable: true }) simId!: string | null;
}

export class SystemSimImportDataSchema {
  @ApiProperty() imported!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty() failed!: number;
  @ApiProperty({ type: SystemSimImportRowResultSchema, isArray: true }) results!: SystemSimImportRowResultSchema[];
}

export class SystemSimImportResponse extends StandardApiResponse<SystemSimImportDataSchema> {
  @ApiProperty({ type: SystemSimImportDataSchema })
  data!: SystemSimImportDataSchema;
}

export class SystemSimStatusItemResultSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) iccid!: string | null;
  @ApiProperty({ enum: ['changed', 'skipped', 'failed'] }) outcome!: string;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty({ nullable: true }) status!: string | null;
}

export class SystemSimBulkStatusDataSchema {
  @ApiProperty({ enum: ['activate', 'suspend', 'reinstate'] }) action!: string;
  @ApiProperty() changed!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty() failed!: number;
  @ApiProperty({ type: SystemSimStatusItemResultSchema, isArray: true }) results!: SystemSimStatusItemResultSchema[];
}

export class SystemSimBulkStatusResponse extends StandardApiResponse<SystemSimBulkStatusDataSchema> {
  @ApiProperty({ type: SystemSimBulkStatusDataSchema })
  data!: SystemSimBulkStatusDataSchema;
}

export class SystemSimDeleteDataSchema {
  @ApiProperty() id!: string;
  @ApiProperty() iccid!: string;
}

export class SystemSimDeleteResponse extends StandardApiResponse<SystemSimDeleteDataSchema> {
  @ApiProperty({ type: SystemSimDeleteDataSchema })
  data!: SystemSimDeleteDataSchema;
}

export class SystemSimDetailResponse extends StandardApiResponse<SystemSimSchema> {
  @ApiProperty({ type: SystemSimSchema })
  data!: SystemSimSchema;
}

export class SystemSimRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() requestType!: string;
  @ApiProperty() numberOfSims!: number;
  @ApiProperty() preferredOperator!: string;
  @ApiProperty() requestedPlan!: string;
  @ApiProperty() requestedDataLimitMb!: number;
  @ApiProperty({ nullable: true }) deploymentTimeline!: string | null;
  @ApiProperty({ nullable: true }) useCase!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) approvedBy!: string | null;
  @ApiProperty({ nullable: true }) approvedByName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) approvedAt!: string | null;
  @ApiProperty({ nullable: true }) rejectedReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemSimRequestsListDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemSimRequestSchema, isArray: true }) requests!: SystemSimRequestSchema[];
}

export class SystemSimRequestsListResponse extends StandardApiResponse<SystemSimRequestsListDataSchema> {
  @ApiProperty({ type: SystemSimRequestsListDataSchema })
  data!: SystemSimRequestsListDataSchema;
}

export class SystemSimRequestsSummaryDataSchema {
  @ApiProperty() totalRequested!: number;
  @ApiProperty() pendingApproval!: number;
  @ApiProperty() approvedThisMonth!: number;
  @ApiProperty() rejectedThisMonth!: number;
}

export class SystemSimRequestsSummaryResponse extends StandardApiResponse<SystemSimRequestsSummaryDataSchema> {
  @ApiProperty({ type: SystemSimRequestsSummaryDataSchema })
  data!: SystemSimRequestsSummaryDataSchema;
}

export class SystemSimBatchSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) requestId!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() activationMode!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() operator!: string;
  @ApiProperty() requestedPlan!: string;
  @ApiProperty() dataLimitGb!: number;
  @ApiProperty() status!: string;
  @ApiProperty() simsActivated!: number;
  @ApiProperty() simsFailed!: number;
  @ApiProperty({ nullable: true }) createdBy!: string | null;
  @ApiProperty({ nullable: true }) createdByName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completedAt!: string | null;
  @ApiProperty({ nullable: true }) errorMessage!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemSimBatchesListDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemSimBatchSchema, isArray: true }) batches!: SystemSimBatchSchema[];
}

export class SystemSimBatchesListResponse extends StandardApiResponse<SystemSimBatchesListDataSchema> {
  @ApiProperty({ type: SystemSimBatchesListDataSchema })
  data!: SystemSimBatchesListDataSchema;
}

export class SystemSimBatchDetailResponse extends StandardApiResponse<SystemSimBatchSchema> {
  @ApiProperty({ type: SystemSimBatchSchema })
  data!: SystemSimBatchSchema;
}

export class SystemSimBatchesSummaryDataSchema {
  @ApiProperty() pendingActivation!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() totalSimsQueued!: number;
  @ApiProperty() needsAttention!: number;
}

export class SystemSimBatchesSummaryResponse extends StandardApiResponse<SystemSimBatchesSummaryDataSchema> {
  @ApiProperty({ type: SystemSimBatchesSummaryDataSchema })
  data!: SystemSimBatchesSummaryDataSchema;
}

/* ── Support Ticket Schemas ───────────────────────────── */

export class SystemSupportTopTenantSchema {
  @ApiProperty() tenantId!: string;
  @ApiProperty() count!: number;
}

export class SystemSupportNeedsAttentionSchema {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() category!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
}

export class SystemSupportRecentlyResolvedSchema {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: String, format: 'date-time' }) resolvedAt!: string;
}

export class SystemSupportDashboardDataSchema {
  @ApiProperty() open!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() escalated!: number;
  @ApiProperty() waitingOnTenant!: number;
  @ApiProperty() resolved!: number;
  @ApiProperty() closed!: number;
  @ApiProperty() resolvedToday!: number;
  @ApiProperty({ nullable: true, type: Number, example: 0.03, description: 'Mean hours raised to resolved, two decimals. Null when nothing resolved.' })
  avgResolutionHours!: number | null;
  @ApiProperty({ nullable: true, type: Number, example: 2, description: 'Mean minutes raised to resolved, rounded. Null when nothing resolved.' })
  avgResolutionMinutes!: number | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } }) byCategory!: Record<string, number>;
  @ApiProperty({ type: SystemSupportTopTenantSchema, isArray: true }) topTenants!: SystemSupportTopTenantSchema[];
  @ApiProperty({ type: SystemSupportNeedsAttentionSchema, isArray: true }) needsAttention!: SystemSupportNeedsAttentionSchema[];
  @ApiProperty({ type: SystemSupportRecentlyResolvedSchema, isArray: true }) recentlyResolved!: SystemSupportRecentlyResolvedSchema[];
}

export class SystemSupportDashboardResponse extends StandardApiResponse<SystemSupportDashboardDataSchema> {
  @ApiProperty({ type: SystemSupportDashboardDataSchema })
  data!: SystemSupportDashboardDataSchema;
}

export class SystemEscalatedTicketSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() category!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty({ nullable: true }) escalatedTo!: string | null;
  @ApiProperty({ nullable: true }) escalatedReferenceId!: string | null;
  @ApiProperty({ nullable: true }) escalationNotes!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) escalatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemEscalatedPartySchema {
  @ApiProperty() party!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: SystemEscalatedTicketSchema, isArray: true }) tickets!: SystemEscalatedTicketSchema[];
}

export class SystemEscalatedTicketsDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemEscalatedPartySchema, isArray: true }) parties!: SystemEscalatedPartySchema[];
}

export class SystemEscalatedTicketsResponse extends StandardApiResponse<SystemEscalatedTicketsDataSchema> {
  @ApiProperty({ type: SystemEscalatedTicketsDataSchema })
  data!: SystemEscalatedTicketsDataSchema;
}

/* ── System Health Schemas ────────────────────────────── */

export class SystemHealthServiceSchema {
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'] }) status!: string;
  @ApiProperty({ nullable: true }) latencyMs!: number | null;
  @ApiProperty({ nullable: true }) uptime!: number | null;
}

export class SystemHealthDataSchema {
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'] }) overall!: string;
  @ApiProperty({ type: SystemHealthServiceSchema, isArray: true }) services!: SystemHealthServiceSchema[];
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: string;
}

export class SystemHealthResponse extends StandardApiResponse<SystemHealthDataSchema> {
  @ApiProperty({ type: SystemHealthDataSchema })
  data!: SystemHealthDataSchema;
}

/* ── Device Setup Request Schemas ────────────────────── */

export class SystemDeviceSetupRequestTimelineEntrySchema {
  @ApiProperty({ enum: DEVICE_SETUP_REQUEST_STATUSES }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) at!: string;
  @ApiProperty({ nullable: true }) note!: string | null;
}

export class SystemDeviceSetupRequestChargeLineSchema {
  @ApiProperty({ enum: SETUP_REQUEST_CHARGE_KINDS }) kind!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Naira' }) unitPriceNgn!: number;
  @ApiProperty({ description: 'Naira, quantity × unitPriceNgn' }) amountNgn!: number;
}

export class SystemDeviceSetupRequestChargesSchema {
  @ApiProperty({ enum: ['NGN'] }) currency!: string;
  @ApiProperty({ example: 'm2m_standard' }) planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({ type: SystemDeviceSetupRequestChargeLineSchema, isArray: true })
  lines!: SystemDeviceSetupRequestChargeLineSchema[];
  @ApiProperty({ description: 'Naira' }) totalNgn!: number;
}

export class SystemDeviceSetupRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'DVR-401882' }) referenceNumber!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ nullable: true }) organisationName!: string | null;
  @ApiProperty({ nullable: true }) requestingEmail!: string | null;
  @ApiProperty({ nullable: true, description: 'Null until the platform picks the hardware' }) manufacturer!: string | null;
  @ApiProperty({ nullable: true }) model!: string | null;
  @ApiProperty({ nullable: true, description: 'Null until the platform picks the hardware' }) trackerType!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() simRequired!: boolean;
  @ApiProperty({ nullable: true }) vehicleId!: string | null;
  @ApiProperty({ nullable: true }) state!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) preferredInstallDate!: string | null;
  @ApiProperty() useCase!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: DEVICE_SETUP_REQUEST_STATUSES }) status!: string;
  @ApiProperty({ nullable: true, enum: ['verified', 'pending', 'rejected'] }) kycStatus!: string | null;
  @ApiProperty({ nullable: true, description: 'Id of the installer fitting the devices' }) assignedTo!: string | null;
  @ApiProperty({
    type: SystemDeviceSetupRequestChargesSchema,
    nullable: true,
    description: 'Licence (tenant plan year-1 price) and installation per device, priced and stored at approval. Null before approval.',
  })
  charges!: SystemDeviceSetupRequestChargesSchema | null;
  @ApiProperty({ nullable: true }) decidedBy!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) decidedAt!: string | null;
  @ApiProperty({ nullable: true }) decisionReason!: string | null;
  @ApiProperty({ type: SystemDeviceSetupRequestTimelineEntrySchema, isArray: true })
  timeline!: SystemDeviceSetupRequestTimelineEntrySchema[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemDeviceSetupRequestsDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemDeviceSetupRequestSchema, isArray: true }) requests!: SystemDeviceSetupRequestSchema[];
}

export class SystemDeviceSetupRequestsResponse extends StandardApiResponse<SystemDeviceSetupRequestsDataSchema> {
  @ApiProperty({ type: SystemDeviceSetupRequestsDataSchema })
  data!: SystemDeviceSetupRequestsDataSchema;
}

export class SystemDeviceSetupRequestDetailResponse extends StandardApiResponse<SystemDeviceSetupRequestSchema> {
  @ApiProperty({ type: SystemDeviceSetupRequestSchema })
  data!: SystemDeviceSetupRequestSchema;
}

export class InstallerDeviceSetupRequestSchema extends PickType(SystemDeviceSetupRequestSchema, [
  'id', 'referenceNumber', 'organisationName', 'manufacturer', 'model', 'trackerType', 'quantity', 'simRequired',
  'vehicleId', 'state', 'city', 'preferredInstallDate', 'useCase', 'notes', 'status', 'timeline', 'createdAt', 'updatedAt',
] as const) {}

export class InstallerDeviceSetupRequestResponse extends StandardApiResponse<InstallerDeviceSetupRequestSchema> {
  @ApiProperty({ type: InstallerDeviceSetupRequestSchema })
  data!: InstallerDeviceSetupRequestSchema;
}

export class InstallerDeviceSetupRequestListResponse extends StandardApiResponse<InstallerDeviceSetupRequestSchema[]> {
  @ApiProperty({ type: InstallerDeviceSetupRequestSchema, isArray: true })
  data!: InstallerDeviceSetupRequestSchema[];
}

/* ── Onboarding: Business Info ──────────────────────────────────────────── */

export class BusinessInfoSchema {
  @ApiProperty() tenantId!: string;
  @ApiProperty() companyName!: string;
  @ApiPropertyOptional({ nullable: true }) registrationNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) taxId!: string | null;
  @ApiPropertyOptional({ nullable: true }) businessType!: string | null;
  @ApiPropertyOptional({ nullable: true }) industry!: string | null;
  @ApiPropertyOptional({ nullable: true }) addressLine1!: string | null;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiPropertyOptional({ nullable: true }) state!: string | null;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) country!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) billingEmail!: string | null;
  @ApiPropertyOptional({ nullable: true }) website!: string | null;
  @ApiPropertyOptional({ nullable: true }) yearEstablished!: number | null;
  @ApiPropertyOptional({ nullable: true }) numberOfEmployees!: number | null;
  @ApiProperty({ enum: ['pending', 'under_review', 'verified', 'rejected'] }) verificationStatus!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class BusinessInfoResponse extends StandardApiResponse<BusinessInfoSchema | null> {
  @ApiProperty({ nullable: true, type: BusinessInfoSchema })
  data!: BusinessInfoSchema | null;
}

/* ── Onboarding: KYC Documents ─────────────────────────────────────────── */

export class KycDocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() documentType!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ enum: ['pending', 'under_review', 'verified', 'rejected'] }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class KycDocumentsDataSchema {
  @ApiProperty({ type: KycDocumentSchema, isArray: true }) documents!: KycDocumentSchema[];
}

export class KycDocumentsResponse extends StandardApiResponse<KycDocumentsDataSchema> {
  @ApiProperty({ type: KycDocumentsDataSchema })
  data!: KycDocumentsDataSchema;
}

/* ── Onboarding: Status ─────────────────────────────────────────────────── */

export class OnboardingStatusSchema {
  @ApiProperty() tenantId!: string;
  @ApiProperty() isOnboarded!: boolean;
  @ApiProperty({ enum: ['pending', 'in_progress', 'completed', 'rejected'] }) onboardingStatus!: string;
  @ApiPropertyOptional({ nullable: true }) planCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) subscriptionStatus!: string | null;
}

export class OnboardingStatusResponse extends StandardApiResponse<OnboardingStatusSchema> {
  @ApiProperty({ type: OnboardingStatusSchema })
  data!: OnboardingStatusSchema;
}

/* ── Session / Auth Action Schemas ─────────────────────────────────────── */

export class MessageDataSchema {
  @ApiProperty() message!: string;
}

export class MessageResponse extends StandardApiResponse<MessageDataSchema> {
  @ApiProperty({ type: MessageDataSchema })
  data!: MessageDataSchema;
}

export class ValidateInviteDataSchema {
  @ApiProperty() email!: string;
  @ApiProperty() role!: string;
  @ApiProperty() tenantId!: string;
}

export class ValidateInviteResponse extends StandardApiResponse<ValidateInviteDataSchema> {
  @ApiProperty({ type: ValidateInviteDataSchema })
  data!: ValidateInviteDataSchema;
}

export class ChangeRoleDataSchema {
  @ApiProperty() message!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() newRole!: string;
}

export class ChangeRoleResponse extends StandardApiResponse<ChangeRoleDataSchema> {
  @ApiProperty({ type: ChangeRoleDataSchema })
  data!: ChangeRoleDataSchema;
}

export class LogoutDataSchema {
  @ApiProperty() message!: string;
  @ApiProperty({ nullable: true, type: String }) userId!: string | null;
}

export class LogoutResponse extends StandardApiResponse<LogoutDataSchema> {
  @ApiProperty({ type: LogoutDataSchema })
  data!: LogoutDataSchema;
}

/* ── System SIM Action Schemas ──────────────────────────────────────────── */

export class SystemSimRequestApproveDataSchema {
  @ApiProperty() requestId!: string;
  @ApiProperty() batchId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() operator!: string;
}

export class SystemSimRequestActionResponse extends StandardApiResponse<SystemSimRequestApproveDataSchema> {
  @ApiProperty({ type: SystemSimRequestApproveDataSchema })
  data!: SystemSimRequestApproveDataSchema;
}

export class SystemSimRequestRejectDataSchema {
  @ApiProperty() requestId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() reason!: string;
}

export class SystemSimRejectActionResponse extends StandardApiResponse<SystemSimRequestRejectDataSchema> {
  @ApiProperty({ type: SystemSimRequestRejectDataSchema })
  data!: SystemSimRequestRejectDataSchema;
}

export class SimBatchRetryDataSchema {
  @ApiProperty() batchId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() quantity!: number;
}

export class SimBatchRetryResponse extends StandardApiResponse<SimBatchRetryDataSchema> {
  @ApiProperty({ type: SimBatchRetryDataSchema })
  data!: SimBatchRetryDataSchema;
}

/* ── System Support Ticket Schemas ──────────────────────────────────────── */

export class SupportTicketRelatedJobSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'FL-1000' }) jobNumber!: string;
}

export class SystemSupportTicketSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 1000 }) ticketNumber!: number;
  @ApiProperty({ example: '#tkt-1000' }) displayId!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ enum: ['tenant_user', 'installer'] }) reporterType!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Installer tickets only' }) reporterName!: string | null;
  @ApiProperty({ nullable: true, type: SupportTicketRelatedJobSchema }) relatedJob!: SupportTicketRelatedJobSchema | null;
  @ApiProperty() subject!: string;
  @ApiProperty() category!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) escalatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class SystemSupportTicketsListDataSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemSupportTicketSchema, isArray: true }) tickets!: SystemSupportTicketSchema[];
}

export class SystemSupportTicketsListResponse extends StandardApiResponse<SystemSupportTicketsListDataSchema> {
  @ApiProperty({ type: SystemSupportTicketsListDataSchema })
  data!: SystemSupportTicketsListDataSchema;
}

export class SystemSupportMessageSchema {
  @ApiProperty() id!: string;
  @ApiProperty() ticketId!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() senderName!: string;
  @ApiProperty() senderRole!: string;
  @ApiProperty() message!: string;
  @ApiProperty() isInternal!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class SystemSupportTicketAttachmentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() ticketId!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Set when attached with a reply' }) messageId!: string | null;
  @ApiProperty() key!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() uploadedBy!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class SystemSupportTicketDetailDataSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 1000 }) ticketNumber!: number;
  @ApiProperty({ example: '#tkt-1000' }) displayId!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ enum: ['tenant_user', 'installer'] }) reporterType!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Installer tickets only' }) reporterName!: string | null;
  @ApiProperty({ nullable: true, type: SupportTicketRelatedJobSchema }) relatedJob!: SupportTicketRelatedJobSchema | null;
  @ApiProperty() subject!: string;
  @ApiProperty() category!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) escalatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: SystemSupportMessageSchema, isArray: true }) messages!: SystemSupportMessageSchema[];
  @ApiProperty({ type: SystemSupportTicketAttachmentSchema, isArray: true }) attachments!: SystemSupportTicketAttachmentSchema[];
}

export class SystemSupportTicketDetailResponse extends StandardApiResponse<SystemSupportTicketDetailDataSchema> {
  @ApiProperty({ type: SystemSupportTicketDetailDataSchema })
  data!: SystemSupportTicketDetailDataSchema;
}

export class SystemSupportTicketStatusUpdateDataSchema {
  @ApiProperty() ticketId!: string;
  @ApiProperty() status!: string;
}

export class SystemSupportTicketActionResponse extends StandardApiResponse<SystemSupportTicketStatusUpdateDataSchema> {
  @ApiProperty({ type: SystemSupportTicketStatusUpdateDataSchema })
  data!: SystemSupportTicketStatusUpdateDataSchema;
}

export class SystemSupportTicketEscalateDataSchema {
  @ApiProperty() ticketId!: string;
  @ApiProperty() escalatedTo!: string;
  @ApiProperty() escalatedBy!: string;
}

export class SystemSupportTicketEscalateResponse extends StandardApiResponse<SystemSupportTicketEscalateDataSchema> {
  @ApiProperty({ type: SystemSupportTicketEscalateDataSchema })
  data!: SystemSupportTicketEscalateDataSchema;
}

export class SystemSupportMessagesDataSchema {
  @ApiProperty() ticketId!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: SystemSupportMessageSchema, isArray: true }) messages!: SystemSupportMessageSchema[];
}

export class SystemSupportMessagesResponse extends StandardApiResponse<SystemSupportMessagesDataSchema> {
  @ApiProperty({ type: SystemSupportMessagesDataSchema })
  data!: SystemSupportMessagesDataSchema;
}

export class SystemSupportMessageActionResponse extends StandardApiResponse<SystemSupportMessageSchema> {
  @ApiProperty({ type: SystemSupportMessageSchema })
  data!: SystemSupportMessageSchema;
}

/* ── Tenant SIM Schemas ─────────────────────────────────────────────────── */

export class TenantSimAssignedDeviceSchema {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() type!: string;
  @ApiProperty() imei!: string;
  @ApiProperty({ nullable: true, type: String }) vehicleId!: string | null;
}

export class TenantSimSchema {
  @ApiProperty() id!: string;
  @ApiProperty() iccid!: string;
  @ApiProperty() imsi!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty() operator!: string;
  @ApiProperty() status!: string;
  @ApiProperty() simType!: string;
  @ApiProperty() dataLimitGb!: number;
  @ApiProperty() dataUsedGb!: number;
  @ApiProperty() monthlyRentalNaira!: number;
  @ApiProperty({ nullable: true, type: TenantSimAssignedDeviceSchema }) assignedDevice!: TenantSimAssignedDeviceSchema | null;
}

export class TenantSimsListDataSchema {
  @ApiProperty({ type: TenantSimSchema, isArray: true }) items!: TenantSimSchema[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class TenantSimsListResponse extends StandardApiResponse<TenantSimsListDataSchema> {
  @ApiProperty({ type: TenantSimsListDataSchema })
  data!: TenantSimsListDataSchema;
}

export class TenantSimDetailDataSchema {
  @ApiProperty() id!: string;
  @ApiProperty() iccid!: string;
  @ApiProperty() imsi!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty() operator!: string;
  @ApiProperty() status!: string;
  @ApiProperty() simType!: string;
  @ApiProperty() dataLimitGb!: number;
  @ApiProperty() dataUsedGb!: number;
  @ApiProperty() monthlyRentalNaira!: number;
  @ApiProperty({ nullable: true, type: TenantSimAssignedDeviceSchema }) assignedDevice!: TenantSimAssignedDeviceSchema | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class TenantSimDetailResponse extends StandardApiResponse<TenantSimDetailDataSchema> {
  @ApiProperty({ type: TenantSimDetailDataSchema })
  data!: TenantSimDetailDataSchema;
}

export class TenantSimIdDataSchema {
  @ApiProperty() id!: string;
}

export class TenantSimActionResponse extends StandardApiResponse<TenantSimIdDataSchema> {
  @ApiProperty({ type: TenantSimIdDataSchema })
  data!: TenantSimIdDataSchema;
}

/* ── Tenant SIM Request Schemas ─────────────────────────────────────────── */

export class TenantSimRequestDataBundlePlanSchema {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() dataLimitGb!: number;
}

export class TenantSimRequestTimelineEntrySchema {
  @ApiProperty() label!: string;
  @ApiProperty({ type: String, format: 'date-time' }) at!: string;
  @ApiProperty({ nullable: true, type: String }) by!: string | undefined;
}

export class TenantSimRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() organizationName!: string;
  @ApiProperty() requestingEmail!: string;
  @ApiProperty() carrier!: string;
  @ApiProperty() planType!: string;
  @ApiProperty({ type: TenantSimRequestDataBundlePlanSchema }) dataBundlePlan!: TenantSimRequestDataBundlePlanSchema;
  @ApiProperty() useCase!: string;
  @ApiProperty({ enum: ['pending_review', 'approved', 'rejected', 'fulfilled'] }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: TenantSimRequestTimelineEntrySchema, isArray: true }) timeline!: TenantSimRequestTimelineEntrySchema[];
}

export class TenantSimRequestsListDataSchema {
  @ApiProperty({ type: TenantSimRequestSchema, isArray: true }) items!: TenantSimRequestSchema[];
  @ApiProperty() total!: number;
}

export class TenantSimRequestsListResponse extends StandardApiResponse<TenantSimRequestsListDataSchema> {
  @ApiProperty({ type: TenantSimRequestsListDataSchema })
  data!: TenantSimRequestsListDataSchema;
}

export class TenantSimRequestDetailResponse extends StandardApiResponse<TenantSimRequestSchema> {
  @ApiProperty({ type: TenantSimRequestSchema })
  data!: TenantSimRequestSchema;
}

/* ── Carrier & Bundle Catalog Schemas ───────────────────────────────────── */

export class CarrierSchema {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() active!: boolean;
}

export class CarriersListDataSchema {
  @ApiProperty({ type: CarrierSchema, isArray: true }) carriers!: CarrierSchema[];
}

export class CarriersListResponse extends StandardApiResponse<CarriersListDataSchema> {
  @ApiProperty({ type: CarriersListDataSchema })
  data!: CarriersListDataSchema;
}

export class BundlePlanSchema {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrier!: string;
  @ApiProperty() dataAmountGb!: number;
  @ApiProperty() validityDays!: number;
  @ApiProperty() billingCycle!: string;
  @ApiProperty() price!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() active!: boolean;
}

export class BundlePlansListDataSchema {
  @ApiProperty({ type: BundlePlanSchema, isArray: true }) items!: BundlePlanSchema[];
  @ApiProperty() total!: number;
}

export class BundlePlansListResponse extends StandardApiResponse<BundlePlansListDataSchema> {
  @ApiProperty({ type: BundlePlansListDataSchema })
  data!: BundlePlansListDataSchema;
}

export class SystemCarrierIdDataSchema {
  @ApiProperty() id!: string;
}

export class SystemCarrierActionResponse extends StandardApiResponse<SystemCarrierIdDataSchema> {
  @ApiProperty({ type: SystemCarrierIdDataSchema })
  data!: SystemCarrierIdDataSchema;
}

export class SystemBundleIdDataSchema {
  @ApiProperty() id!: string;
}

export class SystemBundleActionResponse extends StandardApiResponse<SystemBundleIdDataSchema> {
  @ApiProperty({ type: SystemBundleIdDataSchema })
  data!: SystemBundleIdDataSchema;
}

/* ── Data Bundle Dashboard Schemas ──────────────────────────────────────── */

export class BundleSummaryDataSchema {
  @ApiProperty() walletBalance!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() totalAmountToppedUp!: number;
  @ApiProperty() successfulTopUpTransactions!: number;
  @ApiProperty() activeAllocations!: number;
  @ApiProperty() expiredAllocations!: number;
  @ApiProperty() expiringWithinSevenDays!: number;
  @ApiProperty() monthlySpend!: number;
  @ApiProperty() topUpsThisMonth!: number;
  @ApiProperty() totalDataUsedGb!: number;
}

export class BundleSummaryResponse extends StandardApiResponse<BundleSummaryDataSchema> {
  @ApiProperty({ type: BundleSummaryDataSchema })
  data!: BundleSummaryDataSchema;
}

export class WalletBalanceDataSchema {
  @ApiProperty() balance!: number;
  @ApiProperty() currency!: string;
}

export class WalletBalanceResponse extends StandardApiResponse<WalletBalanceDataSchema> {
  @ApiProperty({ type: WalletBalanceDataSchema })
  data!: WalletBalanceDataSchema;
}

export class SpendingLimitDataSchema {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() monthlyLimit!: number;
  @ApiProperty() spentThisMonth!: number;
  @ApiProperty() resetDayOfMonth!: number;
  @ApiProperty({ nullable: true, type: String }) alertEmail!: string | null;
  @ApiProperty({ type: 'number', isArray: true }) notifyAtPercentages!: number[];
}

export class SpendingLimitResponse extends StandardApiResponse<SpendingLimitDataSchema> {
  @ApiProperty({ type: SpendingLimitDataSchema })
  data!: SpendingLimitDataSchema;
}

export class AutoTopUpDataSchema {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() thresholdAmount!: number;
  @ApiProperty() topUpAmount!: number;
  @ApiProperty() paymentProvider!: string;
  @ApiProperty({ nullable: true, type: String }) mobileNumber!: string | null;
}

export class AutoTopUpResponse extends StandardApiResponse<AutoTopUpDataSchema> {
  @ApiProperty({ type: AutoTopUpDataSchema })
  data!: AutoTopUpDataSchema;
}

export class BundleAllocationBundleSchema {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrier!: string;
  @ApiProperty() dataAmountGb!: number;
  @ApiProperty() billingCycle!: string;
  @ApiProperty() price!: number;
}

export class BundleAllocationSchema {
  @ApiProperty() id!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty({ nullable: true, type: BundleAllocationBundleSchema }) bundle!: BundleAllocationBundleSchema | null;
  @ApiProperty() dataUsedMb!: number;
  @ApiProperty() dataTotalMb!: number;
  @ApiProperty() dataUsedGb!: number;
  @ApiProperty() dataTotalGb!: number;
  @ApiProperty() usagePercentage!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) activatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt!: string | null;
  @ApiProperty() daysLeft!: number;
  @ApiProperty() status!: string;
}

export class BundleAllocationsListDataSchema {
  @ApiProperty({ type: BundleAllocationSchema, isArray: true }) items!: BundleAllocationSchema[];
  @ApiProperty() total!: number;
}

export class BundleAllocationsListResponse extends StandardApiResponse<BundleAllocationsListDataSchema> {
  @ApiProperty({ type: BundleAllocationsListDataSchema })
  data!: BundleAllocationsListDataSchema;
}

export class BundleAllocationDetailDataSchema {
  @ApiProperty() id!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty({ nullable: true, type: BundleAllocationBundleSchema }) bundle!: BundleAllocationBundleSchema | null;
  @ApiProperty() dataUsedMb!: number;
  @ApiProperty() dataTotalMb!: number;
  @ApiProperty() dataUsedGb!: number;
  @ApiProperty() dataTotalGb!: number;
  @ApiProperty() dataRemainingMb!: number;
  @ApiProperty() dataRemainingGb!: number;
  @ApiProperty() usagePercentage!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) activatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt!: string | null;
  @ApiProperty() daysLeft!: number;
  @ApiProperty() status!: string;
}

export class BundleAllocationDetailResponse extends StandardApiResponse<BundleAllocationDetailDataSchema> {
  @ApiProperty({ type: BundleAllocationDetailDataSchema })
  data!: BundleAllocationDetailDataSchema;
}

export class BundleTransactionBundleRefSchema {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrier!: string;
}

export class BundleTransactionSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, format: 'date-time' }) date!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty({ type: BundleTransactionBundleRefSchema }) bundle!: BundleTransactionBundleRefSchema;
  @ApiProperty() amount!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String }) paymentReference!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
}

export class BundleTransactionsListDataSchema {
  @ApiProperty({ type: BundleTransactionSchema, isArray: true }) items!: BundleTransactionSchema[];
  @ApiProperty() total!: number;
}

export class BundleTransactionsListResponse extends StandardApiResponse<BundleTransactionsListDataSchema> {
  @ApiProperty({ type: BundleTransactionsListDataSchema })
  data!: BundleTransactionsListDataSchema;
}

export class SpendTrendEntrySchema {
  @ApiProperty() date!: string;
  @ApiProperty() amount!: number;
}

export class SpendTrendDataSchema {
  @ApiProperty({ type: SpendTrendEntrySchema, isArray: true }) trend!: SpendTrendEntrySchema[];
}

export class SpendTrendResponse extends StandardApiResponse<SpendTrendDataSchema> {
  @ApiProperty({ type: SpendTrendDataSchema })
  data!: SpendTrendDataSchema;
}

export class SpendBreakdownEntrySchema {
  @ApiProperty() bundleId!: string;
  @ApiProperty() bundleName!: string;
  @ApiProperty() bundleCode!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() percentage!: number;
}

export class SpendBreakdownDataSchema {
  @ApiProperty({ type: SpendBreakdownEntrySchema, isArray: true }) breakdown!: SpendBreakdownEntrySchema[];
}

export class SpendBreakdownResponse extends StandardApiResponse<SpendBreakdownDataSchema> {
  @ApiProperty({ type: SpendBreakdownDataSchema })
  data!: SpendBreakdownDataSchema;
}

export class CarrierDistributionEntrySchema {
  @ApiProperty() carrierId!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() percentage!: number;
}

export class CarrierDistributionDataSchema {
  @ApiProperty({ type: CarrierDistributionEntrySchema, isArray: true }) distribution!: CarrierDistributionEntrySchema[];
}

export class CarrierDistributionResponse extends StandardApiResponse<CarrierDistributionDataSchema> {
  @ApiProperty({ type: CarrierDistributionDataSchema })
  data!: CarrierDistributionDataSchema;
}

export class SubscriptionUsageEntrySchema {
  @ApiProperty() bundleId!: string;
  @ApiProperty() bundleCode!: string;
  @ApiProperty() usedMb!: number;
  @ApiProperty() totalMb!: number;
}

export class SubscriptionUsageDataSchema {
  @ApiProperty({ type: SubscriptionUsageEntrySchema, isArray: true }) usage!: SubscriptionUsageEntrySchema[];
}

export class SubscriptionUsageResponse extends StandardApiResponse<SubscriptionUsageDataSchema> {
  @ApiProperty({ type: SubscriptionUsageDataSchema })
  data!: SubscriptionUsageDataSchema;
}

export class BundleRateSchema {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() carrier!: string;
  @ApiProperty() dataAmountGb!: number;
  @ApiProperty() validityDays!: number;
  @ApiProperty() billingCycle!: string;
  @ApiProperty() price!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() active!: boolean;
}

export class BundleRatesListDataSchema {
  @ApiProperty({ type: BundleRateSchema, isArray: true }) items!: BundleRateSchema[];
  @ApiProperty() total!: number;
}

export class BundleRatesListResponse extends StandardApiResponse<BundleRatesListDataSchema> {
  @ApiProperty({ type: BundleRatesListDataSchema })
  data!: BundleRatesListDataSchema;
}

/* ── SIM Import / Device Mapping Schemas ────────────────────────────────── */

export class ImportSimsDataSchema {
  @ApiProperty() imported!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty() failed!: number;
}

export class ImportSimsResponse extends StandardApiResponse<ImportSimsDataSchema> {
  @ApiProperty({ type: ImportSimsDataSchema })
  data!: ImportSimsDataSchema;
}

export class DeviceMappingUploadDataSchema {
  @ApiProperty() processed!: number;
  @ApiProperty() mapped!: number;
  @ApiProperty() failed!: number;
}

export class DeviceMappingUploadResponse extends StandardApiResponse<DeviceMappingUploadDataSchema> {
  @ApiProperty({ type: DeviceMappingUploadDataSchema })
  data!: DeviceMappingUploadDataSchema;
}

/* ── Onboarding Payment / Misc Schemas ──────────────────────────────────── */

export class PaymentIntentDataSchema {
  @ApiProperty({ enum: ['paystack', 'momo'] }) gateway!: 'paystack' | 'momo';
  @ApiProperty() reference!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) authorizationUrl?: string | null;
  @ApiPropertyOptional({ type: String }) accessCode?: string;
  @ApiPropertyOptional({ type: String }) ussdString?: string;
  @ApiPropertyOptional({ type: String }) message?: string;
}

export class PaymentIntentResponse extends StandardApiResponse<PaymentIntentDataSchema> {
  @ApiProperty({ type: PaymentIntentDataSchema })
  data!: PaymentIntentDataSchema;
}

export class ExchangeRateDataSchema {
  @ApiProperty({ example: 'NGN', description: 'Currency every platform figure is in' })
  currency!: string;

  @ApiProperty({ description: 'Whether conversion is switched on', example: false })
  internationalCurrency!: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null while international currency is off. Never applied to a stored amount.',
  })
  ngnPerUsd!: number | null;
}

export class ExchangeRateResponse extends StandardApiResponse<ExchangeRateDataSchema> {
  @ApiProperty({ type: ExchangeRateDataSchema })
  data!: ExchangeRateDataSchema;
}

export class EnterpriseEnquiryDataSchema {
  @ApiProperty() ticketId!: string;
}

export class EnterpriseEnquiryResponse extends StandardApiResponse<EnterpriseEnquiryDataSchema> {
  @ApiProperty({ type: EnterpriseEnquiryDataSchema })
  data!: EnterpriseEnquiryDataSchema;
}

export class SubscriptionCapsDataSchema {
  @ApiProperty({ nullable: true, type: String }) planCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) planName!: string | null;
  @ApiProperty({ nullable: true, type: String }) planTier!: string | null;
  @ApiProperty({ nullable: true, type: Number }) maxActiveVehicles!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Null until plans carry a device cap' }) maxDevices!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Null until plans carry a SIM cap' }) maxSims!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxUsers!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) subscriptionActivatedAt!: string | null;
}

export class SubscriptionCapsResponse extends StandardApiResponse<SubscriptionCapsDataSchema> {
  @ApiProperty({ type: SubscriptionCapsDataSchema })
  data!: SubscriptionCapsDataSchema;
}

export class RequestIdDataSchema {
  @ApiProperty() requestId!: string;
}

export class RequestIdResponse extends StandardApiResponse<RequestIdDataSchema> {
  @ApiProperty({ type: RequestIdDataSchema })
  data!: RequestIdDataSchema;
}

export class IdDataSchema {
  @ApiProperty() id!: string;
}

export class IdResponse extends StandardApiResponse<IdDataSchema> {
  @ApiProperty({ type: IdDataSchema })
  data!: IdDataSchema;
}

export class RegisterSimsResultDataSchema {
  @ApiProperty({ description: 'Number of SIMs registered' }) registered!: number;
}

export class RegisterSimsResultResponse extends StandardApiResponse<RegisterSimsResultDataSchema> {
  @ApiProperty({ type: RegisterSimsResultDataSchema })
  data!: RegisterSimsResultDataSchema;
}

export class FeatureTogglesSchema {
  @ApiPropertyOptional() liveTracking?: boolean;
  @ApiPropertyOptional() geofencing?: boolean;
  @ApiPropertyOptional() routeOptimization?: boolean;
  @ApiPropertyOptional() messaging?: boolean;
  @ApiPropertyOptional() advancedAnalytics?: boolean;
  @ApiPropertyOptional() apiAccess?: boolean;
}

export class FeatureTogglesDataSchema {
  @ApiProperty({ type: FeatureTogglesSchema }) features!: FeatureTogglesSchema;
}

export class FeatureTogglesResponse extends StandardApiResponse<FeatureTogglesDataSchema> {
  @ApiProperty({ type: FeatureTogglesDataSchema })
  data!: FeatureTogglesDataSchema;
}

export class CompleteOnboardingDataSchema {
  @ApiProperty({ type: String, format: 'date-time' }) completedAt!: string;
}

export class CompleteOnboardingResponse extends StandardApiResponse<CompleteOnboardingDataSchema> {
  @ApiProperty({ type: CompleteOnboardingDataSchema })
  data!: CompleteOnboardingDataSchema;
}

export class WalletTopUpDataSchema {
  @ApiProperty() transactionId!: string;
  @ApiProperty() paymentReference!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ enum: ['pending'] }) status!: 'pending';
  @ApiProperty() paymentProvider!: string;
  @ApiProperty() mobileNumber!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class WalletTopUpResponse extends StandardApiResponse<WalletTopUpDataSchema> {
  @ApiProperty({ type: WalletTopUpDataSchema })
  data!: WalletTopUpDataSchema;
}

export class EnabledDataSchema {
  @ApiProperty() enabled!: boolean;
}

export class EnabledResponse extends StandardApiResponse<EnabledDataSchema> {
  @ApiProperty({ type: EnabledDataSchema })
  data!: EnabledDataSchema;
}

export class AllocateBundleFailureSchema {
  @ApiProperty() mobileNumber!: string;
  @ApiProperty() reason!: string;
}

export class AllocateBundleDataSchema {
  @ApiProperty({ type: String, isArray: true }) allocationIds!: string[];
  @ApiProperty() totalAmount!: number;
  @ApiProperty() successfulCount!: number;
  @ApiProperty() failedCount!: number;
  @ApiPropertyOptional({ type: AllocateBundleFailureSchema, isArray: true }) failures?: AllocateBundleFailureSchema[];
}

export class AllocateBundleResponse extends StandardApiResponse<AllocateBundleDataSchema> {
  @ApiProperty({ type: AllocateBundleDataSchema })
  data!: AllocateBundleDataSchema;
}

export class PaystackWebhookAckSchema {
  @ApiProperty() received!: boolean;
}

export class KycReviewDocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() documentType!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty() fileSize!: number;
  @ApiProperty({ enum: ['pending', 'under_review', 'verified', 'rejected'] }) status!: string;
  @ApiProperty({ nullable: true }) reviewedBy!: string | null;
  @ApiProperty({ nullable: true }) reviewedAt!: Date | null;
  @ApiProperty({ nullable: true }) rejectionReason!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class KycReviewQueueDataSchema {
  @ApiProperty({ type: KycReviewDocumentSchema, isArray: true }) items!: KycReviewDocumentSchema[];
  @ApiProperty() total!: number;
}

export class KycReviewQueueResponse extends StandardApiResponse<KycReviewQueueDataSchema> {
  @ApiProperty({ type: KycReviewQueueDataSchema })
  data!: KycReviewQueueDataSchema;
}

export class KycReviewDocumentResponse extends StandardApiResponse<KycReviewDocumentSchema> {
  @ApiProperty({ type: KycReviewDocumentSchema })
  data!: KycReviewDocumentSchema;
}
