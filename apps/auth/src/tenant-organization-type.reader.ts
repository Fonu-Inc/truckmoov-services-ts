import { Inject, Injectable, Optional } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';

/**
 * The signed-in user's account type (enterprise, owner_operator, …), so the web
 * can tell an owner operator's staff from an enterprise's. Null when unknown;
 * callers treat unknown as the stricter case.
 */
@Injectable()
export class TenantOrganizationTypeReader {
  constructor(
    @Optional()
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding?: TenantOnboardingRepository,
  ) {}

  async of(tenantId: string | null | undefined): Promise<string | null> {
    if (!tenantId || tenantId === SYSTEM_TENANT_ID || !this.onboarding) return null;
    try {
      return (await this.onboarding.findByTenantId(tenantId))?.organizationType ?? null;
    } catch {
      return null;
    }
  }
}
