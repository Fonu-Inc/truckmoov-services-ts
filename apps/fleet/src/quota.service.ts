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
    readonly requested = 1,
  ) {
    const noun = resource.replace("_", " ");
    super(
      requested > 1
        ? `This plan allows ${limit} ${noun}, ${current} are in use, and this import adds ${requested}`
        : `This plan allows ${limit} ${noun}, and ${current} are in use`,
    );
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
    return this.assertRoomFor(tenantId, resource, currentCount, 1);
  }

  /**
   * Refuses a batch that would not fit whole.
   *
   * A bulk import is one action to the person who started it. Importing the
   * first forty rows of a fifty-row file and refusing the rest leaves them
   * reconciling a spreadsheet against an inventory, so the whole file is
   * refused and nothing is written.
   */
  async assertRoomFor(
    tenantId: string,
    resource: QuotaResource,
    currentCount: number,
    additional: number,
  ): Promise<void> {
    if (!tenantId || additional <= 0) return;

    const entitlements = await this.entitlements.forTenant(tenantId);
    const quota = entitlements?.quotas?.[resource];

    // No plan, no entitlement for this resource, or unlimited: nothing to
    // enforce. An absent quota is not zero.
    if (quota === undefined || quota === "unlimited") return;
    if (currentCount + additional <= quota) return;

    // Only block refuses. A plan set to warn or bill the overage keeps working.
    if (entitlements?.limitBehaviour?.[resource] !== "block") return;

    throw new FleetQuotaExceededError(resource, quota, currentCount, additional);
  }
}
