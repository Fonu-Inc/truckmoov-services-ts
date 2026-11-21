import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { sweepSafely } from '@shared/observability';
import {
  MtnBundleCatalogSyncService,
  type MtnBundleSyncSummary,
} from './mtn-bundle-catalog-sync.service';

const FIRST_RUN_DELAY_MS = 30_000;

/**
 * Refreshes the MTN bundle prices on a timer.
 *
 * Prices change rarely, so this is deliberately slow and entirely optional:
 * with no `MTN_X_API_KEY` (local, or a deployment that does not use MTN) it
 * does nothing. The admin endpoint remains available for an immediate refresh.
 */
@Injectable()
export class MtnBundleCatalogSweepService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MtnBundleCatalogSweepService.name);
  private starter: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(MtnBundleCatalogSyncService)
    private readonly sync: MtnBundleCatalogSyncService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    if (!this.config.mtn.bundleSyncEnabled) {
      this.logger.log('mtn_bundle_sync:disabled');
      return;
    }
    if (!this.config.mtn.baseUrl.trim()) {
      this.logger.log('mtn_bundle_sync:no_base_url');
      return;
    }
    if (!this.config.mtn.nodeId.trim()) {
      this.logger.log('mtn_bundle_sync:no_node_id');
      return;
    }
    if (!this.config.mtn.apiKey.trim()) {
      this.logger.log('mtn_bundle_sync:no_api_key');
      return;
    }

    const intervalMs = Math.max(
      60_000,
      this.config.mtn.bundleSyncIntervalMinutes * 60_000,
    );
    const tick = () =>
      sweepSafely(this.logger, 'mtn_bundle_sync', () => this.run());
    this.starter = setTimeout(() => {
      void tick();
      this.timer = setInterval(tick, intervalMs);
    }, FIRST_RUN_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<MtnBundleSyncSummary | null> {
    if (this.running) return null;
    this.running = true;
    try {
      // The in-process flag only stops overlapping ticks in this pod; the sync
      // service's advisory lock stops both auth replicas (and an admin
      // request) from writing the catalogue at the same time.
      return await this.sync.syncExclusively(now);
    } finally {
      this.running = false;
    }
  }
}
