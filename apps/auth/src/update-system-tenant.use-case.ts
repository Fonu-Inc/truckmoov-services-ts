import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  AUTH_NOTIFIER,
  ID_GENERATOR,
  INVITE_REPOSITORY,
  ORGANIZATION_SETTINGS_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  EmailTakenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import { buildDefaultOrganizationSettings } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import type { AuthNotifier } from './contexts/auth/session/domain/ports/auth-notifier.port';
import { ForbiddenError } from './contexts/auth/session/domain/errors/forbidden.error';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
import type { OrganizationSettingsRepository } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  DEFAULT_TENANT_FEATURES,
  ORG_TYPE_TO_BOOTSTRAP_ROLE,
  TENANT_ONBOARDING_REPOSITORY,
  type StoredTenantOnboarding,
  type TenantFeatureFlags,
  type TenantOnboardingRepository,
  type TenantOrganizationType,
} from './tenant-onboarding.repository';
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import { validateTenantDeviceProvisioningSelection } from './system-device-catalog.validation';

const SYSTEM_TENANT_ID = 'system';
const SYSTEM_MUTATOR_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);
const ONBOARDING_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export class SystemTenantUpdateConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type UpdateSystemTenantCommand = {
  accessToken: string;
  tenantId: string;
  company?: {
    companyName?: string;
    email?: string;
    phoneNumber?: string;
    billingEmail?: string;
    businessAddress?: string;
    organizationType?: TenantOrganizationType;
  };
  subscription?: {
    planCode?: string;
    billingCycle?: 'monthly' | 'yearly';
  };
  deviceProvisioning?: {
    provisionNow?: boolean;
    numberOfDevices?: number;
    deviceManufacturer?: string;
    deviceModel?: string;
  };
  simAssignment?: {
    provisionNow?: boolean;
    numberOfSims?: number;
    carrier?: string;
    dataPackage?: string;
  };
  features?: Partial<TenantFeatureFlags>;
};

@Injectable()
export class UpdateSystemTenantUseCase {
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
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
  ) {}

  async execute(command: UpdateSystemTenantCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_MUTATOR_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError('Only system admins can update tenants');
    }

    const detail = await this.getSystemTenantUseCase.execute(
      command.accessToken,
      command.tenantId,
    );
    const currentTenant = detail.data.tenant;
    const existingOnboarding =
      await this.tenantOnboardingRepository.findByTenantId(command.tenantId);
    const users = await this.userRepository.findAllByTenant(command.tenantId);
    const hasAcceptedUsers = users.length > 0;

    const currentOrganizationType =
      existingOnboarding?.company.organizationType ??
      currentTenant.organizationType ??
      'fleet_provider';
    const nextOrganizationType =
      command.company?.organizationType ?? currentOrganizationType;

    if (
      hasAcceptedUsers &&
      command.company?.organizationType &&
      command.company.organizationType !== currentOrganizationType
    ) {
      throw new SystemTenantUpdateConflictError(
        'Tenant organization type cannot be changed after tenant users have been created',
      );
    }

    const currentEmail = (
      existingOnboarding?.company.email ?? currentTenant.email
    )
      .trim()
      .toLowerCase();
    const nextEmail = (command.company?.email ?? currentEmail)
      .trim()
      .toLowerCase();

    if (hasAcceptedUsers && nextEmail !== currentEmail) {
      throw new SystemTenantUpdateConflictError(
        'Tenant login email cannot be changed after tenant users have been created',
      );
    }

    if (nextEmail !== currentEmail) {
      const [existingUser, existingInvite] = await Promise.all([
        this.userRepository.findByEmail(nextEmail),
        this.inviteRepository.findByEmail(nextEmail),
      ]);
      if (
        (existingUser && existingUser.tenantId !== command.tenantId) ||
        (existingInvite && existingInvite.tenantId !== command.tenantId)
      ) {
        throw new EmailTakenError();
      }
    }

    const now = new Date();
    const bootstrapRole = ORG_TYPE_TO_BOOTSTRAP_ROLE[nextOrganizationType];
    const fallbackPlan = await this.planRepository.findByTier(
      currentTenant.plan,
    );
    const onboarding: StoredTenantOnboarding = {
      id: existingOnboarding?.id ?? this.idGenerator.generate(),
      tenantId: command.tenantId,
      invitedEmail: nextEmail,
      organizationType: nextOrganizationType,
      bootstrapRole,
      status:
        existingOnboarding?.status ??
        (hasAcceptedUsers ? 'managed' : 'pending_activation'),
      company: {
        companyName:
          command.company?.companyName?.trim() ||
          existingOnboarding?.company.companyName ||
          currentTenant.name,
        contactName: existingOnboarding?.company.contactName ?? null,
        email: nextEmail,
        phoneNumber:
          command.company?.phoneNumber?.trim() ||
          existingOnboarding?.company.phoneNumber ||
          currentTenant.phone,
        billingEmail:
          command.company?.billingEmail?.trim().toLowerCase() ||
          existingOnboarding?.company.billingEmail ||
          currentTenant.billingEmail,
        businessAddress:
          command.company?.businessAddress?.trim() ||
          existingOnboarding?.company.businessAddress ||
          currentTenant.address,
        organizationType: nextOrganizationType,
      },
      subscription: {
        planCode:
          command.subscription?.planCode?.trim() ||
          existingOnboarding?.subscription.planCode ||
          currentTenant.planCode ||
          fallbackPlan?.code ||
          '',
        billingCycle:
          command.subscription?.billingCycle ||
          existingOnboarding?.subscription.billingCycle ||
          'monthly',
      },
      deviceProvisioning: await this.mergeDeviceProvisioning(
        existingOnboarding,
        command,
      ),
      simAssignment: this.mergeSimAssignment(existingOnboarding, command),
      features: {
        ...(existingOnboarding?.features ??
          currentTenant.features ??
          DEFAULT_TENANT_FEATURES),
        ...(command.features ?? {}),
      },
      createdByUserId: existingOnboarding?.createdByUserId ?? actor.id,
      createdAt: existingOnboarding?.createdAt ?? now,
      updatedAt: now,
    };

    const settings =
      (await this.organizationSettingsRepository.findByTenantId(
        command.tenantId,
      )) ?? buildDefaultOrganizationSettings(command.tenantId);
    settings.branding.organizationName = onboarding.company.companyName;
    settings.branding.contactEmail =
      onboarding.company.billingEmail ?? onboarding.company.email;
    settings.branding.phoneNumber = onboarding.company.phoneNumber;
    settings.branding.address = onboarding.company.businessAddress;

    await this.tenantOnboardingRepository.save(onboarding);
    await this.organizationSettingsRepository.save(settings);

    if (!hasAcceptedUsers) {
      const pendingInvite =
        await this.inviteRepository.findPendingByEmailForTenant(
          command.tenantId,
          nextEmail,
        );
      const shouldRotateInvite =
        !pendingInvite ||
        pendingInvite.role !== bootstrapRole ||
        nextEmail !== currentEmail;
      if (shouldRotateInvite) {
        await this.inviteRepository.deleteByTenantId(command.tenantId);
        const inviteToken = this.idGenerator.generate();
        await this.inviteRepository.save({
          id: this.idGenerator.generate(),
          email: nextEmail,
          role: bootstrapRole,
          tenantId: command.tenantId,
          token: inviteToken,
          invitedBy: actor.id,
          status: 'pending',
          expiresAt: new Date(now.getTime() + ONBOARDING_INVITE_TTL_MS),
          createdAt: now,
        });
        await this.notifier.sendTenantInviteEmail({
          email: nextEmail,
          role: bootstrapRole,
          inviteToken,
        });
      }
    }

    return {
      ...(await this.getSystemTenantUseCase.execute(
        command.accessToken,
        command.tenantId,
      )),
      message: 'Tenant updated successfully',
    };
  }

  private async mergeDeviceProvisioning(
    existingOnboarding: StoredTenantOnboarding | null,
    command: UpdateSystemTenantCommand,
  ): Promise<StoredTenantOnboarding['deviceProvisioning']> {
    const current = existingOnboarding?.deviceProvisioning ?? {
      provisionNow: false,
      numberOfDevices: null,
      deviceManufacturer: null,
      deviceModel: null,
    };
    if (!command.deviceProvisioning) {
      return current;
    }
    if (command.deviceProvisioning.provisionNow === false) {
      return {
        provisionNow: false,
        numberOfDevices: null,
        deviceManufacturer: null,
        deviceModel: null,
      };
    }

    const normalizedSelection = await validateTenantDeviceProvisioningSelection(
      this.deviceModelCatalogRepository,
      {
        provisionNow:
          command.deviceProvisioning.provisionNow ?? current.provisionNow,
        deviceManufacturer:
          command.deviceProvisioning.deviceManufacturer ??
          current.deviceManufacturer,
        deviceModel:
          command.deviceProvisioning.deviceModel ?? current.deviceModel,
      },
    );

    return {
      provisionNow:
        command.deviceProvisioning.provisionNow ?? current.provisionNow,
      numberOfDevices:
        command.deviceProvisioning.numberOfDevices ?? current.numberOfDevices,
      deviceManufacturer: normalizedSelection.deviceManufacturer,
      deviceModel: normalizedSelection.deviceModel,
    };
  }

  private mergeSimAssignment(
    existingOnboarding: StoredTenantOnboarding | null,
    command: UpdateSystemTenantCommand,
  ): StoredTenantOnboarding['simAssignment'] {
    const current = existingOnboarding?.simAssignment ?? {
      provisionNow: false,
      numberOfSims: null,
      carrier: null,
      dataPackage: null,
    };
    if (!command.simAssignment) {
      return current;
    }
    if (command.simAssignment.provisionNow === false) {
      return {
        provisionNow: false,
        numberOfSims: null,
        carrier: null,
        dataPackage: null,
      };
    }
    return {
      provisionNow: command.simAssignment.provisionNow ?? current.provisionNow,
      numberOfSims: command.simAssignment.numberOfSims ?? current.numberOfSims,
      carrier:
        (command.simAssignment.carrier as
          | StoredTenantOnboarding['simAssignment']['carrier']
          | undefined) ?? current.carrier,
      dataPackage:
        (command.simAssignment.dataPackage as
          | StoredTenantOnboarding['simAssignment']['dataPackage']
          | undefined) ?? current.dataPackage,
    };
  }
}
