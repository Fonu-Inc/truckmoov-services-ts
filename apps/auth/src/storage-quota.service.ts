import { Inject, Injectable } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import {
  BYTES_PER_GB,
  STORAGE_USAGE_REPOSITORY,
  StorageQuotaExceededError,
  type StorageSource,
  type StorageUsageRepository,
} from './storage-usage.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

/**
 * Whether a tenant has room for more bytes, and what they currently hold.
 *
 * The check reads one summed row rather than counting files, so it costs the
 * same for a tenant with ten documents as for one with a million. That matters
 * because it runs on every upload.
 */
@Injectable()
export class StorageQuotaService {
  constructor(
    @Inject(STORAGE_USAGE_REPOSITORY) private readonly usage: StorageUsageRepository,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
  ) {}

  /**
   * Refuses an upload that would take the tenant past their plan.
   *
   * Only new uploads are refused. Data already stored is left alone, so a
   * tenant who moves to a smaller plan keeps what they have and simply cannot
   * add more.
   */
  async assertRoomFor(tenantId: string, incomingBytes: number): Promise<void> {
    const limitGb = await this.limitGbFor(tenantId);
    if (limitGb === null) return;

    const used = await this.usage.totalBytes(tenantId);
    if (used + incomingBytes <= limitGb * BYTES_PER_GB) return;

    throw new StorageQuotaExceededError(limitGb, used);
  }

  async record(tenantId: string, source: StorageSource, deltaBytes: number): Promise<void> {
    await this.usage.addBytes(tenantId, source, deltaBytes);
  }

  async report(tenantId: string) {
    const [used, breakdown, limitGb] = await Promise.all([
      this.usage.totalBytes(tenantId),
      this.usage.breakdown(tenantId),
      this.limitGbFor(tenantId),
    ]);

    return {
      usedBytes: used,
      limitGb,
      // Null rather than a number when the plan sets no limit, so a screen can
      // show "unlimited" instead of inventing a percentage against infinity.
      percentUsed: limitGb === null ? null : (used / (limitGb * BYTES_PER_GB)) * 100,
      breakdown,
    };
  }

  /** Null means the plan sets no storage limit, which is not a limit of zero. */
  private async limitGbFor(tenantId: string): Promise<number | null> {
    const onboarding = await this.onboarding.findByTenantId(tenantId);
    const planCode = onboarding?.subscription?.planCode;
    if (!planCode) return null;

    try {
      const effective = await this.entitlements.effectiveFor(planCode);
      const quota = effective.quotas.storage_gb;
      if (quota === undefined || quota === 'unlimited') return null;
      return quota;
    } catch {
      return null;
    }
  }
}
