import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  COMPLIANCE_DOCUMENT_REPOSITORY,
  type ComplianceDocumentRepository,
  type StoredComplianceDocument,
} from "./compliance-document.repository";
import { ComplianceReminderWindowService } from "./compliance-reminder-window.service";

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Announces compliance documents that are about to expire, or already have.
 *
 * One event per tenant carrying that tenant's documents, so the recipient list
 * is resolved by the service that owns users. Fleet does not know who belongs to
 * an account and deliberately does not look.
 *
 * Each document is announced once per expiry date: the sweep stamps
 * `reminder_sent_at`, and changing the expiry clears it again. That also keeps
 * several replicas from sending duplicates, since only the first to stamp a row
 * includes it.
 */
@Injectable()
export class ComplianceReminderSweepService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ComplianceReminderSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(COMPLIANCE_DOCUMENT_REPOSITORY)
    private readonly repo: ComplianceDocumentRepository,
    @Inject(ComplianceReminderWindowService)
    private readonly window: ComplianceReminderWindowService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ tenants: number; documents: number }> {
    try {
      const cutoff = this.cutoffDate();
      const due = await this.repo.findDueForReminder(cutoff);
      if (due.length === 0) return { tenants: 0, documents: 0 };

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
    } catch (error) {
      this.logger.error(`compliance_reminder_sweep_failed:${(error as Error).message}`);
      return { tenants: 0, documents: 0 };
    }
  }

  private cutoffDate(): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + this.window.reminderDays);
    return cutoff.toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
