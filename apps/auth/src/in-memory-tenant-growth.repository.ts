import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { lagosMonthKey } from './tenant-collections.repository';
import type { TenantGrowthRepository } from './tenant-growth.repository';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';

@Injectable()
export class InMemoryTenantGrowthRepository implements TenantGrowthRepository {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY) private readonly onboardings: TenantOnboardingRepository,
  ) {}

  async tenantsCreatedByLagosMonth(): Promise<Map<string, number>> {
    const created = new Map<string, Date>();
    for (const onboarding of await this.onboardings.findAll()) {
      if (onboarding.tenantId !== SYSTEM_TENANT_ID) created.set(onboarding.tenantId, onboarding.createdAt);
    }
    for (const [tenantId, at] of await this.earliestUserDates()) {
      if (!created.has(tenantId)) created.set(tenantId, at);
    }
    const months = new Map<string, number>();
    for (const at of created.values()) {
      const key = lagosMonthKey(at);
      months.set(key, (months.get(key) ?? 0) + 1);
    }
    return months;
  }

  private async earliestUserDates(): Promise<Map<string, Date>> {
    const earliest = new Map<string, Date>();
    for (const user of await this.users.findAll()) {
      const at = (user as { createdAt?: Date }).createdAt;
      if (!at || !user.tenantId || user.tenantId === SYSTEM_TENANT_ID) continue;
      const known = earliest.get(user.tenantId);
      if (!known || at < known) earliest.set(user.tenantId, at);
    }
    return earliest;
  }
}
