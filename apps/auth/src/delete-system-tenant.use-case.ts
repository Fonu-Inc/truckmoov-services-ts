import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  INVITE_REPOSITORY,
  ORGANIZATION_SETTINGS_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import { ForbiddenError } from './contexts/auth/session/domain/errors/forbidden.error';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
import type { OrganizationSettingsRepository } from './contexts/auth/session/domain/ports/organization-settings.repository.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import { SYSTEM_TENANT_ID } from '@shared/identity';

const SYSTEM_MUTATOR_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

export class SystemTenantDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class DeleteSystemTenantUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
    @Inject(ORGANIZATION_SETTINGS_REPOSITORY)
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_MUTATOR_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError('Only system admins can delete tenants');
    }

    const detail = await this.getSystemTenantUseCase.execute(
      accessToken,
      tenantId,
    );
    const users = await this.userRepository.findAllByTenant(tenantId);
    if (users.length > 0) {
      throw new SystemTenantDeleteConflictError(
        'Tenants with user accounts cannot be deleted',
      );
    }
    if (
      detail.data.tenant.vehicleCount > 0 ||
      detail.data.tenant.driverCount > 0 ||
      detail.data.tenant.deviceCount > 0
    ) {
      throw new SystemTenantDeleteConflictError(
        'Tenants with provisioned operational data cannot be deleted',
      );
    }

    await Promise.all([
      this.inviteRepository.deleteByTenantId(tenantId),
      this.organizationSettingsRepository.deleteByTenantId(tenantId),
      this.tenantOnboardingRepository.deleteByTenantId(tenantId),
    ]);

    return {
      status: true,
      message: 'Tenant deleted successfully',
      data: {
        tenantId,
        deleted: true,
      },
    };
  }
}
