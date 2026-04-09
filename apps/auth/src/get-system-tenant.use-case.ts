import { Inject, Injectable } from "@nestjs/common";
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from "./tenant-onboarding.repository";
import { ListSystemTenantsUseCase } from "./list-system-tenants.use-case";

export class SystemTenantNotFoundError extends Error {
  constructor() {
    super("Tenant not found");
  }
}

@Injectable()
export class GetSystemTenantUseCase {
  constructor(
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    const tenants = await this.listSystemTenantsUseCase.list(accessToken, {});
    const tenant = tenants.find((candidate) => candidate.id === tenantId);
    if (!tenant) {
      throw new SystemTenantNotFoundError();
    }

    const onboarding = await this.tenantOnboardingRepository.findByTenantId(tenantId);

    return {
      status: true,
      message: "success",
      data: {
        tenant,
        onboarding: onboarding
          ? {
              onboardingId: onboarding.id,
              tenantId: onboarding.tenantId,
              status: onboarding.status,
              bootstrapRole: onboarding.bootstrapRole,
              company: onboarding.company,
              subscription: onboarding.subscription,
              deviceProvisioning: onboarding.deviceProvisioning,
              simAssignment: onboarding.simAssignment,
              features: onboarding.features,
              adminInviteEmail: onboarding.invitedEmail,
              createdAt: onboarding.createdAt.toISOString(),
            }
          : null,
      },
    };
  }
}
