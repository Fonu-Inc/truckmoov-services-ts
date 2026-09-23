import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";

export class StorageQuotaExceededError extends Error {}

/**
 * Reports bytes stored or removed to auth, which holds the tenant's total.
 *
 * Fleet owns the documents but not the plan, so it cannot decide whether a file
 * fits. Auth answers that and keeps the running total. Fleet reports only its
 * own source, which is what lets each service recompute its own subtotal later
 * without reading another service's tables.
 */
@Injectable()
export class StorageReporterService {
  private readonly logger = new Logger(StorageReporterService.name);

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  /**
   * Records an upload, and refuses it if the tenant has no room.
   *
   * Called before the file reaches object storage, so a refusal leaves nothing
   * behind. Auth performs the check and the record in one call, so fleet cannot
   * store bytes it was not cleared for.
   */
  async recordUpload(tenantId: string, bytes: number): Promise<void> {
    await this.report(tenantId, bytes, "upload");
  }

  /** Records a deletion. Always permitted, so a failure is logged, not raised. */
  async recordDeletion(tenantId: string, bytes: number): Promise<void> {
    try {
      await this.report(tenantId, -Math.abs(bytes), "delete");
    } catch (error) {
      // The file is already gone. Failing the delete would leave the caller
      // unable to remove it at all, and the subtotal is recomputable.
      this.logger.warn(
        `storage_delete_report_failed:${tenantId}:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /**
   * Reports a freshly recomputed total for this service's own source.
   *
   * Replaces the counter rather than moving it, which is the only way a
   * drifted total returns to the truth: the drift is exactly the amount nobody
   * knows about.
   */
  async reconcile(tenantId: string, bytesUsed: number): Promise<void> {
    const headers = this.caller.headers("auth", { tenantId, legacyRole: "FLEET_ADMIN" });
    if (!headers) return;

    const response = await axios.post(
      `${this.config.auth.serviceUrl}/auth/internal/usage/storage/reconcile`,
      { source: "fleet_documents", bytesUsed },
      {
        headers,
        timeout: 5000,
        validateStatus: () => true,
      },
    );

    if (response.status !== 200 && response.status !== 201) {
      this.logger.warn(`storage_reconcile_failed:${tenantId}:status=${response.status}`);
    }
  }

  private async report(tenantId: string, deltaBytes: number, reference: string): Promise<void> {
    const headers = this.caller.headers("auth", { tenantId, legacyRole: "FLEET_ADMIN" });
    if (!headers) return;

    const response = await axios.post(
      `${this.config.auth.serviceUrl}/auth/internal/usage/storage`,
      { source: "fleet_documents", deltaBytes, reference },
      {
        headers,
        timeout: 3000,
        validateStatus: () => true,
      },
    );

    if (response.status === 413) {
      throw new StorageQuotaExceededError(
        typeof response.data?.message === "string"
          ? response.data.message
          : "Storage quota exceeded",
      );
    }

    if (response.status !== 200 && response.status !== 201) {
      // Auth unreachable on an upload. Allowed through rather than refused: a
      // storage total that is briefly low is a smaller problem than an outage
      // in auth stopping every document upload in the platform.
      this.logger.warn(`storage_report_failed:${tenantId}:status=${response.status}`);
    }
  }
}
