import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { tableExists } from '@shared/db';
import { Role, roleFromId } from '@shared/rbac';
import {
  ORGANIZATION_SETTINGS_REPOSITORY,
  SESSION_STORE,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { OrganizationSettingsRepository } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import type { SessionStore } from './contexts/auth/session/domain/ports/session-store.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type {
  StoredUser,
  UserRepository,
} from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import {
  TENANT_SUSPENSION_REPOSITORY,
  type TenantSuspensionRepository,
} from './tenant-suspension.repository';
import {
  TENANT_TERMINATION_REPOSITORY,
  type TenantTerminationRepository,
} from './tenant-termination.repository';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import { UNLIMITED, type PlanEntitlements } from './plan-entitlements';
import {
  noQuotaOverrides,
  OVERRIDABLE_QUOTAS,
  withQuotaOverrides,
  TENANT_QUOTA_OVERRIDES_REPOSITORY,
  type QuotaOverrides,
  type TenantQuotaOverridesRepository,
} from './tenant-quota-overrides.repository';
import { LEGACY_PLAN_CODE_TO_TIER } from './system-subscription-plans';
import {
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  TENANT_COLLECTIONS_REPOSITORY,
  lagosMonthBounds,
  type TenantCollectionsRepository,
} from './tenant-collections.repository';
import {
  INVOICE_REPOSITORY,
  lagosDate,
  type InvoiceRepository,
} from '@auth/onboarding';
import {
  DEFAULT_TENANT_FEATURES,
  TENANT_ONBOARDING_REPOSITORY,
  type StoredTenantOnboarding,
  type TenantFeatureFlags,
  type TenantOnboardingRepository,
  type TenantOrganizationType,
} from './tenant-onboarding.repository';
import { SYSTEM_TENANT_ID } from '@shared/identity';

const SYSTEM_VIEWER_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);
const KYC_STATUSES = [
  'not_submitted',
  'pending',
  'under_review',
  'verified',
  'rejected',
] as const;
const SYSTEM_TENANT_STATUS_VALUES = [
  'active',
  'pending',
  'suspended',
  'inactive',
  'terminated',
] as const;
const SYSTEM_TENANT_PLAN_VALUES = [
  'starter',
  'professional',
  'enterprise',
] as const;

type SystemTenantStatus = (typeof SYSTEM_TENANT_STATUS_VALUES)[number];
type SystemTenantPlan = (typeof SYSTEM_TENANT_PLAN_VALUES)[number];
type SystemTenantKycStatus = (typeof KYC_STATUSES)[number];

type QuotaLimits = Record<(typeof OVERRIDABLE_QUOTAS)[number], number | null>;

type SystemTenantFilters = {
  search?: string;
  status?: SystemTenantStatus;
  plan?: SystemTenantPlan;
  planCode?: string;
  organizationType?: TenantOrganizationType;
  kycStatus?: SystemTenantKycStatus;
  revenueFrom?: number;
  revenueTo?: number;
  lastActiveFrom?: string;
  lastActiveTo?: string;
};

type SystemTenantRow = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  address: string | null;
  billingEmail: string | null;
  plan: SystemTenantPlan;
  /** The licence plan the tenant is on; null when none is assigned. */
  planCode: string | null;
  planName: string | null;
  planAssigned: boolean;
  /** Prepaid/postpaid, from the tenant's plan entitlements. Null when unknown. */
  billingModel: 'prepaid' | 'postpaid' | null;
  /** Overdue invoices for this tenant, counted at read time. */
  overdueInvoices: number;
  status: SystemTenantStatus;
  organizationType: TenantOrganizationType | null;
  organizationTypes: TenantOrganizationType[];
  vehicleCount: number;
  driverCount: number;
  deviceCount: number;
  simCount: number;
  /**
   * What the tenant's plan allows. A null limit is unlimited, which is not
   * zero. Read planAssigned to tell unlimited from no plan.
   */
  quotas: QuotaLimits;
  /** The plan's own limits, before any per-tenant override. */
  planQuotas: QuotaLimits;
  /** Limits set for this tenant by staff; null means the plan limit applies. */
  quotaOverrides: QuotaOverrides;
  /** Cash collected this Africa/Lagos calendar month, in naira. */
  collectedThisMonthNgn: number;
  /** Deprecated alias of collectedThisMonthNgn. */
  monthlyRevenueNgn: number;
  createdAt: string;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  suspendedByName: string | null;
  suspensionReason: string | null;
  features: TenantFeatureFlags;
  invitationStatus: {
    hasPendingInvitation: boolean;
    invitationAccepted: boolean;
  };
  businessInfo: {
    companyName: string;
    registrationNumber: string | null;
    taxId: string | null;
    businessType: string | null;
    industry: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    verificationStatus: SystemTenantKycStatus;
    verifiedAt: string | null;
    yearEstablished: number | null;
  };
};

type CountRow = { tenant_id?: string; count?: number | string };
type SessionRow = { tenant_id?: string; last_active_at?: string | Date | null };
type UserRow = {
  id?: string;
  email?: string;
  tenant_id?: string;
  role_id?: number | string;
  account_status?: string | null;
  profile?: Record<string, unknown> | string | null;
  created_at?: string | Date | null;
};
type OnboardingRow = {
  tenant_id?: string;
  invited_email?: string;
  organization_type?: string;
  status?: string;
  company?: Record<string, unknown> | string | null;
  subscription?: Record<string, unknown> | string | null;
  device_provisioning?: Record<string, unknown> | string | null;
  sim_assignment?: Record<string, unknown> | string | null;
  features?: Record<string, unknown> | string | null;
  created_at?: string | Date | null;
};
type SettingsRow = {
  tenant_id?: string;
  branding?: Record<string, unknown> | string | null;
};
type BusinessInfoRow = {
  tenant_id?: string;
  company_name?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  business_type?: string | null;
  industry?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  verification_status?: string | null;
  verified_at?: string | Date | null;
  year_established?: number | string | null;
};
type OrganizationTypesRow = {
  tenant_id?: string;
  organization_types?: string[] | string | null;
};

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tenant'
  );
}

function parseJsonRecord<T extends Record<string, unknown>>(
  value: unknown,
): T | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    return value as T;
  }
  return null;
}

function normalizeOrgType(
  value?: string | null,
): TenantOrganizationType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    [
      'fleet_provider',
      'fleet-provider',
      'platform_admin',
      'platform-admin',
      'fleet provider',
    ].includes(normalized)
  ) {
    return 'fleet_provider';
  }
  if (
    [
      'enterprise',
      'enterprise_admin',
      'enterprise-admin',
      'cargo_owner',
      'cargo-owner',
    ].includes(normalized)
  ) {
    return 'enterprise';
  }
  if (
    ['aggregator', 'aggregator_admin', 'aggregator-admin'].includes(normalized)
  ) {
    return 'aggregator';
  }
  if (
    ['owner_operator', 'owner-operator', 'owner operator'].includes(normalized)
  ) {
    return 'owner_operator';
  }
  return null;
}

function inferOrgTypeFromRole(
  role?: string | null,
): TenantOrganizationType | null {
  switch (role) {
    // PLATFORM_ADMIN is absent on purpose: it is the internal system role, not
    // a role any stakeholder organisation holds, so it identifies no org type.
    case Role.OPERATIONS_MANAGER:
    case Role.DISPATCHER:
    case Role.FINANCE_VIEWER:
      return 'fleet_provider';
    case Role.ENTERPRISE_ADMIN:
      return 'enterprise';
    case Role.AGGREGATOR_ADMIN:
      return 'aggregator';
    case Role.OWNER_OPERATOR:
      return 'owner_operator';
    default:
      return null;
  }
}

function normalizePlan(planCode?: string | null): SystemTenantPlan {
  const normalized = planCode?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return 'starter';
  }
  if (
    normalized.includes('scale') ||
    normalized.includes('enterprise') ||
    normalized.includes('custom') ||
    normalized.includes('unlimited')
  ) {
    return 'enterprise';
  }
  if (
    normalized.includes('growth') ||
    normalized.includes('professional') ||
    normalized.includes('pro') ||
    normalized.includes('plus')
  ) {
    return 'professional';
  }
  return 'starter';
}

function normalizeKycStatus(value?: string | null): SystemTenantKycStatus {
  const normalized = value?.trim().toLowerCase() ?? 'not_submitted';
  if (normalized === 'approved') {
    return 'verified';
  }
  if ((KYC_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as SystemTenantKycStatus;
  }
  return 'not_submitted';
}

function deriveTenantStatus(params: {
  onboardingStatus?: string | null;
  enabledUsersCount: number;
  usersCount: number;
  terminated?: boolean;
}): SystemTenantStatus {
  // Wins over everything. A terminated tenant has every user disabled, which
  // is indistinguishable from a suspension by any other measure.
  if (params.terminated) return 'terminated';
  if (
    params.onboardingStatus === 'pending_activation' &&
    params.enabledUsersCount === 0
  ) {
    return 'pending';
  }
  if (params.usersCount > 0 && params.enabledUsersCount === 0) {
    return 'suspended';
  }
  if (params.enabledUsersCount > 0) {
    return 'active';
  }
  return 'inactive';
}

function toIsoString(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function earliestCreatedAt(
  users: Array<{ createdAt?: string | Date | null }>,
): string | null {
  return (
    users
      .map((user) => toIsoString(user.createdAt ?? null))
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null
  );
}

@Injectable()
export class ListSystemTenantsUseCase {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
    @Inject(TENANT_TERMINATION_REPOSITORY)
    private readonly terminationRepository: TenantTerminationRepository,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly entitlementsRepository: PlanEntitlementsRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoices: InvoiceRepository,
    @Inject(TENANT_SUSPENSION_REPOSITORY)
    private readonly suspensionRepository: TenantSuspensionRepository,
    @Inject(LICENCE_PERIOD_REPOSITORY)
    private readonly licencePeriods: LicencePeriodRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly m2mPlans: M2mLicensePlanRepository,
    @Inject(TENANT_COLLECTIONS_REPOSITORY)
    private readonly collections: TenantCollectionsRepository,
    @Optional()
    @Inject(TENANT_QUOTA_OVERRIDES_REPOSITORY)
    private readonly quotaOverrides?: TenantQuotaOverridesRepository,
  ) {}

  async execute(accessToken: string, filters: SystemTenantFilters) {
    const tenants = await this.list(accessToken, filters);
    return {
      status: true,
      message: 'success',
      data: {
        total: tenants.length,
        tenants,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async list(
    accessToken: string,
    filters: SystemTenantFilters = {},
  ): Promise<SystemTenantRow[]> {
    await this.ensureSystemViewer(accessToken);
    const tenants =
      this.config.persistence.backend === 'in-memory'
        ? await this.listInMemory()
        : await this.listDatabase();
    await this.resolvePlans(tenants);
    await this.attachOverdueInvoices(tenants);
    await this.attachCollections(tenants);
    await this.attachSuspensions(tenants);
    return this.applyFilters(tenants, filters);
  }

  private async attachSuspensions(tenants: SystemTenantRow[]) {
    const suspended = tenants.filter((tenant) => tenant.status === 'suspended');
    if (suspended.length === 0) {
      return;
    }
    const byTenantId = new Map(
      (await this.suspensionRepository.findAll()).map((entry) => [entry.tenantId, entry]),
    );
    const names = new Map<string, string | null>();
    for (const tenant of suspended) {
      const entry = byTenantId.get(tenant.id);
      if (!entry) continue;
      if (!names.has(entry.suspendedBy)) {
        const actor = await this.userRepository.findById(entry.suspendedBy);
        names.set(entry.suspendedBy, actor ? (actor.profile?.fullName ?? actor.email) : null);
      }
      tenant.suspendedAt = entry.suspendedAt.toISOString();
      tenant.suspendedByName = names.get(entry.suspendedBy) ?? null;
      tenant.suspensionReason = entry.reason;
    }
  }

  private async attachCollections(tenants: SystemTenantRow[]) {
    if (tenants.length === 0) {
      return;
    }
    const { from, to } = lagosMonthBounds(new Date());
    const kobo = await this.collections.collectedKoboByTenant(from, to);
    for (const tenant of tenants) {
      tenant.collectedThisMonthNgn = (kobo.get(tenant.id) ?? 0) / 100;
      tenant.monthlyRevenueNgn = tenant.collectedThisMonthNgn;
    }
  }

  /**
   * Sets each tenant's plan from its licence period, falling back to the plan
   * named at onboarding, then reads name, tier and limits off that code.
   * Catalogs are loaded once, not per tenant.
   */
  private async resolvePlans(tenants: SystemTenantRow[]) {
    if (tenants.length === 0) {
      return;
    }
    const [plans, licenceCodes, m2m, entitlements, overrides] = await Promise.all([
      this.planRepository.findAll(),
      this.licencePeriods.currentPlanCodes(),
      this.m2mPlans.list({ status: 'all', page: 1, limit: 1000 }),
      this.entitlementsRepository.findAll().catch(() => []),
      this.quotaOverrides?.findAll() ?? new Map<string, QuotaOverrides>(),
    ]);
    const tierByCode = new Map(plans.map((plan) => [plan.code, plan.tier]));
    const nameByCode = new Map([
      ...plans.map((plan) => [plan.code, plan.name] as const),
      ...m2m.items.map((plan) => [plan.code, plan.name] as const),
    ]);
    const entitlementsByCode = new Map(entitlements.map((entry) => [entry.planCode, entry]));
    for (const tenant of tenants) {
      const planCode = licenceCodes.get(tenant.id) ?? (tenant.planCode || null);
      tenant.planCode = planCode;
      tenant.planAssigned = planCode !== null;
      tenant.planName = planCode ? (nameByCode.get(planCode) ?? null) : null;
      tenant.plan = this.resolvePlanTier(planCode, tierByCode);
      tenant.planQuotas = toQuotaLimits(planCode ? (entitlementsByCode.get(planCode) ?? null) : null);
      tenant.quotaOverrides = overrides.get(tenant.id) ?? noQuotaOverrides();
      tenant.quotas = withQuotaOverrides(tenant.planQuotas, tenant.quotaOverrides);
      tenant.billingModel = planCode
        ? (entitlementsByCode.get(planCode)?.paymentModel ?? null)
        : null;
    }
  }

  private async attachOverdueInvoices(tenants: SystemTenantRow[]) {
    if (tenants.length === 0) return;
    const counts = await this.invoices.countOverdueByTenant(lagosDate(new Date()));
    for (const tenant of tenants) {
      tenant.overdueInvoices = counts.get(tenant.id) ?? 0;
    }
  }

  private resolvePlanTier(
    planCode: string | null,
    tierByCode: Map<string, SystemTenantPlan>,
  ): SystemTenantPlan {
    if (!planCode) {
      return 'starter';
    }
    return (
      tierByCode.get(planCode) ??
      LEGACY_PLAN_CODE_TO_TIER[planCode] ??
      normalizePlan(planCode)
    );
  }

  private async ensureSystemViewer(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_VIEWER_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError('You are not permitted to view tenants');
    }
    return actor;
  }

  private applyFilters(
    tenants: SystemTenantRow[],
    filters: SystemTenantFilters,
  ) {
    const search = filters.search?.trim().toLowerCase();
    const lastActiveFrom = filters.lastActiveFrom
      ? new Date(filters.lastActiveFrom).getTime()
      : null;
    const lastActiveTo = filters.lastActiveTo
      ? // Date-only "to" bounds should include the whole day.
        new Date(filters.lastActiveTo).getTime() +
        (/^\d{4}-\d{2}-\d{2}$/.test(filters.lastActiveTo.trim())
          ? 86_400_000 - 1
          : 0)
      : null;
    return tenants.filter((tenant) => {
      const matchesSearch =
        !search ||
        tenant.name.toLowerCase().includes(search) ||
        tenant.email.toLowerCase().includes(search) ||
        (tenant.billingEmail?.toLowerCase().includes(search) ?? false);
      const matchesStatus = !filters.status || tenant.status === filters.status;
      const matchesPlan = !filters.plan || tenant.plan === filters.plan;
      const matchesPlanCode =
        !filters.planCode || tenant.planCode === filters.planCode;
      const matchesOrganizationType =
        !filters.organizationType ||
        tenant.organizationTypes.includes(filters.organizationType) ||
        tenant.organizationType === filters.organizationType;
      const matchesKyc =
        !filters.kycStatus ||
        tenant.businessInfo.verificationStatus === filters.kycStatus;
      const matchesRevenueFrom =
        filters.revenueFrom == null ||
        tenant.collectedThisMonthNgn >= filters.revenueFrom;
      const matchesRevenueTo =
        filters.revenueTo == null ||
        tenant.collectedThisMonthNgn <= filters.revenueTo;
      const lastActiveTime = tenant.lastActiveAt
        ? new Date(tenant.lastActiveAt).getTime()
        : null;
      const matchesLastActiveFrom =
        lastActiveFrom == null ||
        (lastActiveTime != null && lastActiveTime >= lastActiveFrom);
      const matchesLastActiveTo =
        lastActiveTo == null ||
        (lastActiveTime != null && lastActiveTime <= lastActiveTo);
      return (
        matchesSearch &&
        matchesStatus &&
        matchesPlan &&
        matchesPlanCode &&
        matchesOrganizationType &&
        matchesKyc &&
        matchesRevenueFrom &&
        matchesRevenueTo &&
        matchesLastActiveFrom &&
        matchesLastActiveTo
      );
    });
  }

  private async listInMemory(): Promise<SystemTenantRow[]> {
    const [users, onboardings] = await Promise.all([
      this.userRepository.findAll(),
      this.tenantOnboardingRepository.findAll(),
    ]);

    const tenantIds = new Set<string>([
      ...users.map((user) => user.tenantId),
      ...onboardings.map((onboarding) => onboarding.tenantId),
    ]);
    tenantIds.delete(SYSTEM_TENANT_ID);

    const sessionActivity = await this.sessionStore.listUserActivity(
      users.map((user) => user.id),
    );
    const sessionByUserId = new Map(
      sessionActivity.map((activity) => [activity.userId, activity]),
    );
    const usersByTenantId = new Map<string, StoredUser[]>();
    for (const user of users) {
      if (user.tenantId === SYSTEM_TENANT_ID) {
        continue;
      }
      const bucket = usersByTenantId.get(user.tenantId) ?? [];
      bucket.push(user);
      usersByTenantId.set(user.tenantId, bucket);
    }
    const onboardingByTenantId = new Map(
      onboardings.map((onboarding) => [onboarding.tenantId, onboarding]),
    );
    const terminatedTenantIds = new Set(await this.terminationRepository.listTenantIds());

    const rows = await Promise.all(
      [...tenantIds].map(async (tenantId) => {
        const tenantUsers = usersByTenantId.get(tenantId) ?? [];
        const onboarding = onboardingByTenantId.get(tenantId) ?? null;
        const settings =
          await this.organizationSettingsRepository.findByTenantId(tenantId);
        const enabledUsers = tenantUsers.filter(
          (user) => (user.accountStatus ?? 'enabled') === 'enabled',
        );
        const primaryUser = tenantUsers[0] ?? null;
        const acceptedUser = onboarding
          ? (tenantUsers.find(
              (user) =>
                user.email.toLowerCase() ===
                onboarding.invitedEmail.toLowerCase(),
            ) ?? null)
          : null;
        const lastActiveAt =
          tenantUsers
            .map((user) => sessionByUserId.get(user.id)?.lastActiveAt ?? null)
            .filter((value): value is Date => value instanceof Date)
            .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

        return this.composeTenantRow({
          tenantId,
          terminated: terminatedTenantIds.has(tenantId),
          onboarding,
          users: tenantUsers,
          enabledUsersCount: enabledUsers.length,
          settingsBranding: settings?.branding ?? null,
          vehicleCount: 0,
          driverCount: 0,
          deviceCount: 0,
          businessInfo: null,
          organizationTypes: onboarding?.company.organizationType
            ? [onboarding.company.organizationType]
            : [],
          lastActiveAt: lastActiveAt?.toISOString() ?? null,
          createdAt:
            onboarding?.createdAt.toISOString() ??
            lastActiveAt?.toISOString() ??
            new Date().toISOString(),
          invitationAccepted: Boolean(acceptedUser),
        });
      }),
    );

    return rows.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  private async listDatabase(): Promise<SystemTenantRow[]> {
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();

    const [
      users,
      settingsRows,
      onboardingRows,
      sessionRows,
      vehicleCounts,
      driverCounts,
      deviceCounts,
      businessInfoRows,
      organizationTypesRows,
    ] = await Promise.all([
      connection.execute<UserRow[]>(
        'select id, email, tenant_id, role_id, account_status, profile, created_at from auth_users where tenant_id <> ? order by created_at asc',
        [SYSTEM_TENANT_ID],
      ),
      connection.execute<SettingsRow[]>(
        'select tenant_id, branding from auth_organization_settings where tenant_id <> ?',
        [SYSTEM_TENANT_ID],
      ),
      this.selectOnboardings(connection),
      connection.execute<SessionRow[]>(
        'select tenant_id, max(updated_at) as last_active_at from auth_sessions where tenant_id <> ? group by tenant_id',
        [SYSTEM_TENANT_ID],
      ),
      this.countByTenant(connection, 'fleet_vehicles'),
      this.countByTenant(connection, 'fleet_drivers'),
      this.countByTenant(connection, 'fleet_devices'),
      this.selectBusinessInfo(connection),
      this.selectOrganizationTypes(connection),
    ]);

    const onboardingByTenantId = new Map<string, StoredTenantOnboarding>();
    for (const row of onboardingRows) {
      const tenantId = row.tenant_id?.toString();
      if (!tenantId) continue;
      onboardingByTenantId.set(tenantId, {
        id: tenantId,
        tenantId,
        invitedEmail: row.invited_email?.toString() ?? '',
        organizationType:
          normalizeOrgType(row.organization_type?.toString()) ??
          'fleet_provider',
        bootstrapRole: '',
        status:
          row.status?.toString() === 'managed'
            ? 'managed'
            : 'pending_activation',
        company: (parseJsonRecord(row.company) as
          | StoredTenantOnboarding['company']
          | null) ?? {
          companyName: 'Truckmoov Tenant',
          contactName: null,
          email: row.invited_email?.toString() ?? '',
          phoneNumber: null,
          billingEmail: null,
          businessAddress: null,
          organizationType:
            normalizeOrgType(row.organization_type?.toString()) ??
            'fleet_provider',
        },
        subscription: (parseJsonRecord(row.subscription) as
          | StoredTenantOnboarding['subscription']
          | null) ?? {
          planCode: '',
          billingCycle: 'monthly',
        },
        deviceProvisioning: (parseJsonRecord(row.device_provisioning) as
          | StoredTenantOnboarding['deviceProvisioning']
          | null) ?? {
          provisionNow: false,
          numberOfDevices: null,
          deviceManufacturer: null,
          deviceModel: null,
        },
        simAssignment: (parseJsonRecord(row.sim_assignment) as
          | StoredTenantOnboarding['simAssignment']
          | null) ?? {
          provisionNow: false,
          numberOfSims: null,
          carrier: null,
          dataPackage: null,
        },
        features:
          (parseJsonRecord(row.features) as
            | StoredTenantOnboarding['features']
            | null) ?? DEFAULT_TENANT_FEATURES,
        createdByUserId: '',
        createdAt: new Date(row.created_at ?? new Date().toISOString()),
        updatedAt: new Date(row.created_at ?? new Date().toISOString()),
      });
    }

    const usersByTenantId = new Map<
      string,
      Array<StoredUser & { createdAt?: string | Date | null }>
    >();
    for (const row of users) {
      const tenantId = row.tenant_id?.toString();
      const id = row.id?.toString();
      const email = row.email?.toString();
      if (!tenantId || !id || !email || tenantId === SYSTEM_TENANT_ID) continue;
      const profile =
        parseJsonRecord<Record<string, unknown>>(row.profile) ?? {};
      const bucket = usersByTenantId.get(tenantId) ?? [];
      bucket.push({
        id,
        email,
        passwordHash: '',
        role: roleFromId(toNumber(row.role_id)),
        tenantId,
        accountStatus:
          row.account_status?.toString() === 'disabled'
            ? 'disabled'
            : 'enabled',
        profile: {
          fullName:
            typeof profile.fullName === 'string' ? profile.fullName : null,
          phoneNumber:
            typeof profile.phoneNumber === 'string'
              ? profile.phoneNumber
              : null,
          address: typeof profile.address === 'string' ? profile.address : null,
          profilePictureUrl:
            typeof profile.profilePictureUrl === 'string'
              ? profile.profilePictureUrl
              : null,
        },
        createdAt: row.created_at ?? null,
      });
      usersByTenantId.set(tenantId, bucket);
    }

    const settingsByTenantId = new Map<string, Record<string, unknown>>();
    for (const row of settingsRows) {
      const tenantId = row.tenant_id?.toString();
      if (!tenantId) continue;
      settingsByTenantId.set(tenantId, parseJsonRecord(row.branding) ?? {});
    }

    const lastActiveAtByTenantId = new Map(
      sessionRows.map((row) => [
        row.tenant_id?.toString() ?? '',
        toIsoString(row.last_active_at),
      ]),
    );
    const vehicleCountByTenantId = new Map(
      vehicleCounts.map((row) => [
        row.tenant_id?.toString() ?? '',
        toNumber(row.count),
      ]),
    );
    const driverCountByTenantId = new Map(
      driverCounts.map((row) => [
        row.tenant_id?.toString() ?? '',
        toNumber(row.count),
      ]),
    );
    const deviceCountByTenantId = new Map(
      deviceCounts.map((row) => [
        row.tenant_id?.toString() ?? '',
        toNumber(row.count),
      ]),
    );
    const businessInfoByTenantId = new Map<string, BusinessInfoRow>();
    for (const row of businessInfoRows) {
      const tenantId = row.tenant_id?.toString();
      if (!tenantId || businessInfoByTenantId.has(tenantId)) continue;
      businessInfoByTenantId.set(tenantId, row);
    }
    const organizationTypesByTenantId = new Map<
      string,
      TenantOrganizationType[]
    >();
    for (const row of organizationTypesRows) {
      const tenantId = row.tenant_id?.toString();
      if (!tenantId) continue;
      const values = Array.isArray(row.organization_types)
        ? row.organization_types
        : typeof row.organization_types === 'string'
          ? row.organization_types.replace(/[{}]/g, '').split(',')
          : [];
      const normalized = [
        ...new Set(
          values
            .map((value) => normalizeOrgType(value))
            .filter((value): value is TenantOrganizationType => Boolean(value)),
        ),
      ];
      organizationTypesByTenantId.set(tenantId, normalized);
    }

    const tenantIds = new Set<string>([
      ...usersByTenantId.keys(),
      ...onboardingByTenantId.keys(),
      ...settingsByTenantId.keys(),
      ...businessInfoByTenantId.keys(),
      ...organizationTypesByTenantId.keys(),
      ...vehicleCountByTenantId.keys(),
      ...driverCountByTenantId.keys(),
      ...deviceCountByTenantId.keys(),
    ]);
    tenantIds.delete('');
    const terminatedTenantIds = new Set(await this.terminationRepository.listTenantIds());

    const rows = [...tenantIds].map((tenantId) => {
      const tenantUsers = usersByTenantId.get(tenantId) ?? [];
      const onboarding = onboardingByTenantId.get(tenantId) ?? null;
      const enabledUsers = tenantUsers.filter(
        (user) => (user.accountStatus ?? 'enabled') === 'enabled',
      );
      const acceptedUser = onboarding
        ? (tenantUsers.find(
            (user) =>
              user.email.toLowerCase() ===
              onboarding.invitedEmail.toLowerCase(),
          ) ?? null)
        : null;
      const firstUserCreatedAt = earliestCreatedAt(tenantUsers);

      return this.composeTenantRow({
        tenantId,
        terminated: terminatedTenantIds.has(tenantId),
        onboarding,
        users: tenantUsers,
        enabledUsersCount: enabledUsers.length,
        settingsBranding: settingsByTenantId.get(tenantId) ?? null,
        vehicleCount: vehicleCountByTenantId.get(tenantId) ?? 0,
        driverCount: driverCountByTenantId.get(tenantId) ?? 0,
        deviceCount: deviceCountByTenantId.get(tenantId) ?? 0,
        businessInfo: businessInfoByTenantId.get(tenantId) ?? null,
        organizationTypes: organizationTypesByTenantId.get(tenantId) ?? [],
        lastActiveAt: lastActiveAtByTenantId.get(tenantId) ?? null,
        createdAt:
          onboarding?.createdAt.toISOString() ??
          firstUserCreatedAt ??
          new Date().toISOString(),
        invitationAccepted: Boolean(acceptedUser),
      });
    });

    return rows.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  private composeTenantRow(params: {
    terminated?: boolean;
    tenantId: string;
    onboarding: StoredTenantOnboarding | null;
    users: Array<StoredUser & { createdAt?: string | Date | null }>;
    enabledUsersCount: number;
    settingsBranding: Record<string, unknown> | null;
    vehicleCount: number;
    driverCount: number;
    deviceCount: number;
    businessInfo: BusinessInfoRow | null;
    organizationTypes: TenantOrganizationType[];
    lastActiveAt: string | null;
    createdAt: string;
    invitationAccepted: boolean;
  }): SystemTenantRow {
    const primaryUser = params.users[0] ?? null;
    const organizationType =
      params.organizationTypes[0] ??
      params.onboarding?.company.organizationType ??
      inferOrgTypeFromRole(primaryUser?.role ?? null);
    const organizationTypes = params.organizationTypes.length
      ? params.organizationTypes
      : organizationType
        ? [organizationType]
        : [];
    const planCode = params.onboarding?.subscription.planCode || null;
    const plan = normalizePlan(planCode);
    const name =
      params.onboarding?.company.companyName ??
      (typeof params.settingsBranding?.organizationName === 'string'
        ? params.settingsBranding.organizationName
        : null) ??
      params.businessInfo?.company_name ??
      primaryUser?.profile?.fullName ??
      primaryUser?.email?.split('@')[0]?.replace(/[._-]+/g, ' ') ??
      params.tenantId;
    const email =
      params.onboarding?.company.email ??
      primaryUser?.email ??
      (typeof params.settingsBranding?.contactEmail === 'string'
        ? params.settingsBranding.contactEmail
        : null) ??
      `${slugify(name)}@unknown.local`;
    const billingEmail =
      params.onboarding?.company.billingEmail ??
      (typeof params.settingsBranding?.contactEmail === 'string'
        ? params.settingsBranding.contactEmail
        : null) ??
      null;
    const phone =
      params.onboarding?.company.phoneNumber ??
      primaryUser?.profile?.phoneNumber ??
      (typeof params.settingsBranding?.phoneNumber === 'string'
        ? params.settingsBranding.phoneNumber
        : null) ??
      null;
    const address =
      params.onboarding?.company.businessAddress ??
      primaryUser?.profile?.address ??
      (typeof params.settingsBranding?.address === 'string'
        ? params.settingsBranding.address
        : null) ??
      null;
    const status = deriveTenantStatus({
      onboardingStatus: params.onboarding?.status,
      enabledUsersCount: params.enabledUsersCount,
      usersCount: params.users.length,
      terminated: params.terminated,
    });
    const hasPendingInvitation =
      params.onboarding?.status === 'pending_activation' &&
      !params.invitationAccepted;
    const verificationStatus = normalizeKycStatus(
      params.businessInfo?.verification_status ?? null,
    );

    return {
      id: params.tenantId,
      name,
      slug: slugify(name),
      email,
      phone,
      address,
      billingEmail,
      plan,
      planCode,
      planName: null,
      planAssigned: planCode !== null,
      billingModel: null,
      overdueInvoices: 0,
      status,
      organizationType: organizationType ?? null,
      organizationTypes,
      vehicleCount: params.vehicleCount,
      driverCount: params.driverCount,
      deviceCount: params.deviceCount,
      simCount: params.onboarding?.simAssignment.numberOfSims ?? 0,
      quotas: toQuotaLimits(null),
      planQuotas: toQuotaLimits(null),
      quotaOverrides: noQuotaOverrides(),
      collectedThisMonthNgn: 0,
      monthlyRevenueNgn: 0,
      createdAt: params.createdAt,
      lastActiveAt: params.lastActiveAt,
      suspendedAt: null,
      suspendedByName: null,
      suspensionReason: null,
      features: params.onboarding?.features ?? { ...DEFAULT_TENANT_FEATURES },
      invitationStatus: {
        hasPendingInvitation,
        invitationAccepted: params.invitationAccepted,
      },
      businessInfo: {
        companyName: params.businessInfo?.company_name ?? name,
        registrationNumber: params.businessInfo?.registration_number ?? null,
        taxId: params.businessInfo?.tax_id ?? null,
        businessType: params.businessInfo?.business_type ?? null,
        industry: params.businessInfo?.industry ?? null,
        addressLine1: params.businessInfo?.address_line1 ?? address,
        addressLine2: params.businessInfo?.address_line2 ?? null,
        city: params.businessInfo?.city ?? null,
        state: params.businessInfo?.state ?? null,
        postalCode: params.businessInfo?.postal_code ?? null,
        country: params.businessInfo?.country ?? null,
        verificationStatus,
        verifiedAt: toIsoString(params.businessInfo?.verified_at ?? null),
        yearEstablished:
          params.businessInfo?.year_established == null
            ? null
            : toNumber(params.businessInfo.year_established),
      },
    };
  }

  private async selectOnboardings(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
  ) {
    if (!(await tableExists(connection, 'system_tenant_onboardings'))) {
      return [] as OnboardingRow[];
    }
    return connection.execute<OnboardingRow[]>(
      `select tenant_id, invited_email, organization_type, status, company, subscription, device_provisioning, sim_assignment, features, created_at
       from system_tenant_onboardings`,
    );
  }

  private async selectBusinessInfo(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
  ) {
    if (!(await tableExists(connection, 'tenant_business_info'))) {
      return [] as BusinessInfoRow[];
    }
    return connection.execute<BusinessInfoRow[]>(
      `select tenant_id, company_name, registration_number, tax_id, business_type, industry, address_line1, address_line2, city, state, postal_code, country, verification_status, verified_at, year_established
       from tenant_business_info`,
    );
  }

  private async selectOrganizationTypes(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
  ) {
    if (!(await tableExists(connection, 'organizations'))) {
      return [] as OrganizationTypesRow[];
    }
    return connection.execute<OrganizationTypesRow[]>(
      `select tenant_id, array_agg(distinct organization_type) as organization_types
       from organizations
       group by tenant_id`,
    );
  }

  private async countByTenant(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
    tableName: string,
  ) {
    if (!(await tableExists(connection, tableName))) {
      return [] as CountRow[];
    }
    return connection.execute<CountRow[]>(
      `select tenant_id, count(*)::int as count from "${tableName}" group by tenant_id`,
    );
  }
}

export type {
  SystemTenantFilters,
  SystemTenantKycStatus,
  SystemTenantPlan,
  SystemTenantRow,
  SystemTenantStatus,
};

/**
 * The plan's limits, as the usage bars need them.
 *
 * `plan_entitlements.quotas` is authoritative; a plan that names no limit for a
 * resource does not restrict it, and unlimited is null rather than a number so
 * a client cannot render it as a full bar.
 */
function toQuotaLimits(entitlements: PlanEntitlements | null): QuotaLimits {
  const limit = (resource: 'vehicles' | 'drivers' | 'devices' | 'sims'): number | null => {
    const quota = entitlements?.quotas?.[resource];
    if (quota === undefined || quota === UNLIMITED) return null;
    return typeof quota === 'number' ? quota : null;
  };

  return {
    vehicles: limit('vehicles'),
    drivers: limit('drivers'),
    devices: limit('devices'),
    sims: limit('sims'),
  };
}
