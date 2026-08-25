import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";
import { StorageReporterService } from "./storage-reporter.service";

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 7 * 60 * 1000;

/**
 * Recomputes what fleet's documents actually occupy, and reports it to auth.
 *
 * Fleet owns the documents, so only fleet can recompute their total. Auth holds
 * the tenant's overall figure and the plan it is measured against, so the
 * result is sent there rather than written locally. Neither service reads the
 * other's tables to do it.
 *
 * Without this, a delete that never reported leaves the total permanently high
 * and the tenant is eventually refused with real room to spare.
 */
@Injectable()
export class StorageReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StorageReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(StorageReporterService) private readonly reporter: StorageReporterService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== "mikro-orm") return;

    // Offset from auth's sweep so the two do not contend for the same rows.
    this.firstRun = setTimeout(() => void this.run(), FIRST_SWEEP_DELAY_MS);
    this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(): Promise<{ tenants: number }> {
    if (this.running) return { tenants: 0 };
    this.running = true;

    try {
      const orm = await getFleetOrm(this.config.db);
      // Summed in the database. The document count is unbounded, and pulling
      // every row into memory to add them up would fail on the largest tenant
      // first, which is the one this matters for.
      const rows = await orm.em
        .getConnection()
        .execute<Array<{ tenant_id: string; bytes: string }>>(
          `select "tenant_id", coalesce(sum("size_bytes"), 0) as bytes
             from "fleet_documents" group by "tenant_id"`,
        );

      for (const row of rows) {
        try {
          await this.reporter.reconcile(row.tenant_id, Number(row.bytes));
        } catch (error) {
          // One tenant failing must not stop the rest being corrected.
          this.logger.warn(
            `storage_reconcile_tenant_failed:${row.tenant_id}:${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      this.logger.log(`storage_reconciled:tenants=${rows.length}`);
      return { tenants: rows.length };
    } catch (error) {
      this.logger.error(
        `storage_reconcile_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return { tenants: 0 };
    } finally {
      this.running = false;
    }
  }
}
