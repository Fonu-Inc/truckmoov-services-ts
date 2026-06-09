import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  AUTH_NOTIFIER,
  ForbiddenError,
  ID_GENERATOR,
  INVITE_REPOSITORY,
  ORGANIZATION_SETTINGS_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import { EmailTakenError } from './contexts/auth/session/domain/errors/email-taken.error';
import type { AuthNotifier } from './contexts/auth/session/domain/ports/auth-notifier.port';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
import type { OrganizationSettingsRepository } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { buildDefaultOrganizationSettings } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import {
  DEFAULT_TENANT_FEATURES,
  TENANT_ONBOARDING_REPOSITORY,
  type StoredTenantOnboarding,
  type TenantFeatureFlags,
  type TenantOnboardingRepository,
  type TenantOrganizationType,
} from './tenant-onboarding.repository';
import { validateTenantDeviceProvisioningSelection } from './system-device-catalog.validation';

const SYSTEM_TENANT_ID = 'system';
const SYSTEM_CREATOR_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);
const ONBOARDING_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const ORG_TYPE_TO_BOOTSTRAP_ROLE: Record<TenantOrganizationType, Role> = {
  fleet_provider: Role.PLATFORM_ADMIN,
  enterprise: Role.ENTERPRISE_ADMIN,
  aggregator: Role.AGGREGATOR_ADMIN,
  owner_operator: Role.OWNER_OPERATOR,
};

export class InvalidSubscriptionPlanError extends Error {
  constructor(planCode: string) {
    super(`Unknown subscription plan code: ${planCode}`);
  }
}

export class TenantContactNameRequiredError extends Error {
  constructor() {
    super('Company contact name is required');
  }
}

export type CreateSystemTenantCommand = {
  accessToken: string;
  company: {
    companyName: string;
    contactName: string;
    email: string;
    phoneNumber?: string;
    billingEmail?: string;
    businessAddress?: string;
    organizationType: TenantOrganizationType;
  };
  subscription: {
    planCode: string;
    billingCycle: 'monthly' | 'yearly';
  };
  deviceProvisioning?: {
    provisionNow: boolean;
    numberOfDevices?: number;
    deviceManufacturer?: string;
    deviceModel?: string;
  };
  simAssignment?: {
    provisionNow: boolean;
    numberOfSims?: number;
    carrier?: string;
    dataPackage?: string;
  };
  features?: Partial<TenantFeatureFlags>;
};

@Injectable()
export class CreateSystemTenantUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
  ) {}

  async execute(command: CreateSystemTenantCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_CREATOR_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError('Only system admins can onboard tenants');
    }

    // NOTE: nested DTO validation (@ValidateNested on company/subscription) does
    // not fire under @Body(BodyOrDataPipe), so the DTO decorators are not the
    // real enforcement point — these guards are. Validate here instead.
    const contactName = command.company.contactName?.trim();
    if (!contactName) {
      throw new TenantContactNameRequiredError();
    }

    const planCode = command.subscription.planCode.trim();
    const plan = await this.planRepository.findByCode(planCode);
    if (!plan) {
      throw new InvalidSubscriptionPlanError(planCode);
    }

    const invitedEmail = command.company.email.trim().toLowerCase();
    const billingEmail =
      command.company.billingEmail?.trim().toLowerCase() ?? null;
    const pendingInvite = await this.inviteRepository.findByEmail(invitedEmail);
    const existingUser = await this.userRepository.findByEmail(invitedEmail);
    if (pendingInvite || existingUser) {
      throw new EmailTakenError();
    }

    const tenantId = this.idGenerator.generate();
    const onboardingId = this.idGenerator.generate();
    const inviteToken = this.idGenerator.generate();
    const bootstrapRole =
      ORG_TYPE_TO_BOOTSTRAP_ROLE[command.company.organizationType];
    const now = new Date();
    const normalizedDeviceProvisioning =
      await validateTenantDeviceProvisioningSelection(
        this.deviceModelCatalogRepository,
        command.deviceProvisioning,
      );

    const features: TenantFeatureFlags = {
      ...DEFAULT_TENANT_FEATURES,
      ...(command.features ?? {}),
    };

    const onboarding: StoredTenantOnboarding = {
      id: onboardingId,
      tenantId,
      invitedEmail,
      organizationType: command.company.organizationType,
      bootstrapRole,
      status: 'pending_activation',
      company: {
        companyName: command.company.companyName.trim(),
        contactName,
        email: invitedEmail,
        phoneNumber: command.company.phoneNumber?.trim() || null,
        billingEmail,
        businessAddress: command.company.businessAddress?.trim() || null,
        organizationType: command.company.organizationType,
      },
      subscription: {
        planCode: command.subscription.planCode.trim(),
        billingCycle: command.subscription.billingCycle,
      },
      deviceProvisioning: {
        provisionNow: command.deviceProvisioning?.provisionNow ?? false,
        numberOfDevices: command.deviceProvisioning?.provisionNow
          ? (command.deviceProvisioning.numberOfDevices ?? null)
          : null,
        deviceManufacturer: normalizedDeviceProvisioning.deviceManufacturer,
        deviceModel: normalizedDeviceProvisioning.deviceModel,
      },
      simAssignment: {
        provisionNow: command.simAssignment?.provisionNow ?? false,
        numberOfSims: command.simAssignment?.provisionNow
          ? (command.simAssignment.numberOfSims ?? null)
          : null,
        carrier: command.simAssignment?.provisionNow
          ? ((command.simAssignment
              .carrier as StoredTenantOnboarding['simAssignment']['carrier']) ??
            null)
          : null,
        dataPackage: command.simAssignment?.provisionNow
          ? ((command.simAssignment
              .dataPackage as StoredTenantOnboarding['simAssignment']['dataPackage']) ??
            null)
          : null,
      },
      features,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    };

    const settings = buildDefaultOrganizationSettings(tenantId);
    settings.branding.organizationName = onboarding.company.companyName;
    settings.branding.contactEmail =
      onboarding.company.billingEmail ?? onboarding.company.email;
    settings.branding.phoneNumber = onboarding.company.phoneNumber;
    settings.branding.address = onboarding.company.businessAddress;

    await this.tenantOnboardingRepository.save(onboarding);
    await this.organizationSettingsRepository.save(settings);
    await this.inviteRepository.save({
      id: this.idGenerator.generate(),
      email: invitedEmail,
      role: bootstrapRole,
      tenantId,
      token: inviteToken,
      invitedBy: actor.id,
      status: 'pending',
      expiresAt: new Date(now.getTime() + ONBOARDING_INVITE_TTL_MS),
      createdAt: now,
    });

    await this.notifier.sendInviteEmail({
      email: invitedEmail,
      role: bootstrapRole,
      inviteToken,
    });

    return {
      status: true,
      message: 'Tenant onboarding created successfully',
      data: {
        onboardingId,
        tenantId,
        status: onboarding.status,
        bootstrapRole,
        company: onboarding.company,
        subscription: onboarding.subscription,
        deviceProvisioning: onboarding.deviceProvisioning,
        simAssignment: onboarding.simAssignment,
        features: onboarding.features,
        adminInviteEmail: invitedEmail,
        createdAt: onboarding.createdAt.toISOString(),
      },
    };
  }
}
