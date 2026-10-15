import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { runIfLockFree } from "@shared/db";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import {
  COMPLIANCE_DOCUMENT_REPOSITORY,
  type ComplianceDocumentRepository,
  type StoredComplianceDocument,
} from "./compliance-document.repository";
import { ComplianceReminderWindowService } from "./compliance-reminder-window.service";
import { lagosDayOffset, lagosToday } from "./utils/lagos-date";

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COMPLIANCE_REMINDER_LOCK_ID = 8_246_113_070_042;
const NOTHING_SENT = { tenants: 0, documents: 0 };

/**
 * Announces compliance documents that are about to expire, or already have.
 *
 * One event per tenant carrying that tenant's documents, so the recipient list
 * is resolved by the service that owns users. Fleet does not know who belongs to
 * an account and deliberately does not look.
 *
 * Each document is announced once per expiry date: the sweep stamps
 * `reminder_sent_at`, and changing the expiry clears it again. A sweep holds an
 * advisory lock, so two replicas never read the same unstamped rows at once.
 */
@Injectable()
export class ComplianceReminderSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ComplianceReminderSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(COMPLIANCE_DOCUMENT_REPOSITORY)
    private readonly repo: ComplianceDocumentRepository,
    @Inject(ComplianceReminderWindowService)
    private readonly window: ComplianceReminderWindowService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<{ tenants: number; documents: number }> {
    try {
      if (this.config.persistence.backend !== "mikro-orm") return await this.sweep();
      const orm = await getFleetOrm(this.config.db);
      const result = await runIfLockFree(orm, COMPLIANCE_REMINDER_LOCK_ID, () => this.sweep());
      return result.acquired ? result.value : NOTHING_SENT;
    } catch (error) {
      this.logger.error(`compliance_reminder_sweep_failed:${(error as Error).message}`);
      return NOTHING_SENT;
    }
  }

  private async sweep(): Promise<{ tenants: number; documents: number }> {
    const cutoff = this.cutoffDate();
    const due = await this.repo.findDueForReminder(cutoff);
    if (due.length === 0) return NOTHING_SENT;

    const byTenant = this.groupByTenant(due);
    let announced = 0;

    for (const [tenantId, docs] of byTenant) {
      const stamped = await this.announce(tenantId, docs);
      if (stamped) announced += docs.length;
    }

    this.logger.log(
      `compliance_reminder_sweep:tenants=${byTenant.size}:documents=${announced}`,
    );
    return { tenants: byTenant.size, documents: announced };
  }

  private cutoffDate(): string {
    return lagosDayOffset(this.window.reminderDays);
  }

  private groupByTenant(
    docs: StoredComplianceDocument[],
  ): Map<string, StoredComplianceDocument[]> {
    const grouped = new Map<string, StoredComplianceDocument[]>();
    for (const doc of docs) {
      const bucket = grouped.get(doc.tenantId);
      if (bucket) bucket.push(doc);
      else grouped.set(doc.tenantId, [doc]);
    }
    return grouped;
  }

  private async announce(
    tenantId: string,
    docs: StoredComplianceDocument[],
  ): Promise<boolean> {
    const today = lagosToday();
    try {
      await this.bus.publish(`tm.${tenantId}.compliance.documents.expiring`, {
        id: randomUUID(),
        type: "compliance.documents.expiring",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        data: {
          reminder_window_days: this.window.reminderDays,
          // The recipient list is left to the service that owns users: every
          // active user on this account, since roles are not guaranteed filled.
          audience: "all_active_tenant_users",
          documents: docs.map((doc) => ({
            id: doc.id,
            vehicle_id: doc.vehicleId,
            document_type: doc.documentType,
            document_name: doc.documentName,
            expiry_date: doc.expiryDate,
            already_expired: (doc.expiryDate ?? "") < today,
          })),
        },
      });
    } catch (error) {
      // Leave the documents unstamped so the next sweep retries them.
      this.logger.warn(
        `compliance_reminder_publish_failed:tenant=${tenantId}:${(error as Error).message}`,
      );
      return false;
    }

    await this.repo.markReminded(
      docs.map((doc) => doc.id),
      new Date(),
    );
    return true;
  }
}
