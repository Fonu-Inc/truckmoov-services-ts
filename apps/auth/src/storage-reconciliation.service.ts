import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { sweepSafely } from '@shared/observability';
import { ObjectStorageService } from '@shared/object-storage';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  STORAGE_USAGE_REPOSITORY,
  type StorageUsageRepository,
} from './storage-usage.repository';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 5 * 60 * 1000;

/**
 * Recomputes the storage subtotals auth owns, from auth's own tables.
 *
 * The running counter is the fast path: it answers in constant time however
 * many files a tenant has. It is also the part that can drift, because a delete
 * that never reported leaves the total permanently high and a tenant is
 * eventually refused with real room to spare.
 *
 * This is what makes the counter eventually correct. It touches only the
 * sources auth owns — fleet recomputes its documents itself and reports the
 * result, because auth cannot read fleet's tables without recreating the
 * coupling this design removed.
 */
@Injectable()
export class StorageReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StorageReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(STORAGE_USAGE_REPOSITORY) private readonly usage: StorageUsageRepository,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;

    // Not at the instant of boot: a rolling deploy would otherwise have every
    // replica sweep the same tenants at once.
    this.firstRun = setTimeout(
      () => sweepSafely(this.logger, 'storage_reconciliation', () => this.run()),
      FIRST_SWEEP_DELAY_MS,
    );
    this.timer = setInterval(
      () => sweepSafely(this.logger, 'storage_reconciliation', () => this.run()),
      SWEEP_INTERVAL_MS,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(): Promise<{ tenants: number; sources: number }> {
    if (this.running) return { tenants: 0, sources: 0 };
    this.running = true;

    try {
      const kyc = await this.sumKycBytes();
      const mailbox = await this.sumMailboxBytes();

      const tenantIds = new Set<string>([...kyc.keys(), ...mailbox.keys()]);
      let sources = 0;

      for (const tenantId of tenantIds) {
        // setBytes, not addBytes: this replaces the counter rather than moving
        // it, which is the only way a drifted total comes back to the truth.
        await this.usage.setBytes(tenantId, 'kyc', kyc.get(tenantId) ?? 0);
        await this.usage.setBytes(tenantId, 'mailbox', mailbox.get(tenantId) ?? 0);
        sources += 2;

        try {
          const mediaBytes = await this.storage.totalBytesUnder(`auth/media/${tenantId}/`);
          await this.usage.setBytes(tenantId, 'media', mediaBytes);
          sources += 1;
        } catch (error) {
          // Object storage unreachable. The media subtotal keeps its previous
          // value rather than being zeroed, which would hand the tenant space
          // they are actually using.
          this.logger.warn(
            `storage_media_reconcile_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }

      const ticketBytes = await this.sumTicketAttachmentBytes();
      for (const [tenantId, bytes] of ticketBytes) {
        await this.usage.setBytes(tenantId, 'support_tickets', bytes);
        sources += 1;
      }

      this.logger.log(`storage_reconciled:tenants=${tenantIds.size}:sources=${sources}`);
      return { tenants: tenantIds.size, sources };
    } catch (error) {
      this.logger.error(
        `storage_reconcile_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { tenants: 0, sources: 0 };
    } finally {
      this.running = false;
    }
  }

  private async sumTicketAttachmentBytes(): Promise<Map<string, number>> {
    return this.sumByTenant(
      `select "tenant_id", coalesce(sum("size_bytes"), 0) as bytes
         from "support_ticket_attachments" group by "tenant_id"`,
    );
  }

  /** Summed in the database rather than in memory: the row count is unbounded. */
  private async sumKycBytes(): Promise<Map<string, number>> {
    return this.sumByTenant(
      `select "tenant_id", coalesce(sum("file_size"), 0) as bytes
         from "tenant_kyc_documents" group by "tenant_id"`,
    );
  }

  /**
   * Only attachments whose bytes were actually fetched into storage count.
   * Metadata for an attachment still sitting on the mail server occupies
   * nothing here.
   */
  private async sumMailboxBytes(): Promise<Map<string, number>> {
    return this.sumByTenant(
      `select m."tenant_id",
              coalesce(sum((a->>'sizeBytes')::bigint), 0) as bytes
         from "tenant_mail_messages" as m,
              lateral jsonb_array_elements(m."attachments") as a
        where a->>'storageKey' is not null
        group by m."tenant_id"`,
    );
  }

  private async sumByTenant(sql: string): Promise<Map<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    try {
      const rows = await orm.em
        .getConnection()
        .execute<Array<{ tenant_id: string; bytes: string }>>(sql);
      return new Map(rows.map((row) => [row.tenant_id, Number(row.bytes)]));
    } catch (error) {
      // A table that does not exist yet on a fresh deployment is not a failure.
      this.logger.warn(
        `storage_sum_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return new Map();
    }
  }
}
