import { Inject, Injectable } from "@nestjs/common";
import {
  EntitlementReaderService,
  type QuotaResource,
} from "./entitlement-reader.service";

export class FleetQuotaExceededError extends Error {
  constructor(
    readonly resource: QuotaResource,
    readonly limit: number,
    readonly current: number,
  ) {
    super(`This plan allows ${limit} ${resource.replace("_", " ")}, and ${current} are in use`);
  }
}

/**
 * Refuses the record that would take a tenant past its plan.
 *
 * The count is passed in rather than counted here, because only the caller
 * knows what counts: active vehicles, not every vehicle ever created.
 */
@Injectable()
export class QuotaService {
  constructor(
    @Inject(EntitlementReaderService) private readonly entitlements: EntitlementReaderService,
  ) {}

  async assertWithinQuota(
    tenantId: string,
    resource: QuotaResource,
    currentCount: number,
  ): Promise<void> {
    if (!tenantId) return;

    const entitlements = await this.entitlements.forTenant(tenantId);
    const quota = entitlements?.quotas?.[resource];

    // No plan, no entitlement for this resource, or unlimited: nothing to
    // enforce. An absent quota is not zero.
    if (quota === undefined || quota === "unlimited") return;
    if (currentCount < quota) return;

    // Only block refuses. A plan set to warn or bill the overage keeps working.
    if (entitlements?.limitBehaviour?.[resource] !== "block") return;

    throw new FleetQuotaExceededError(resource, quota, currentCount);
  }
}
