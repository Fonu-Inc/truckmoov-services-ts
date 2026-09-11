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
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import { SyncMailboxUseCase } from './sync-mailbox.use-case';

/**
 * Drives the mailbox sync on a timer.
 *
 * This is the only piece that assumes where the sync runs. Moving the mail work
 * to its own service replaces this class and its module registration; the use
 * case, the reader and the repository move unchanged.
 *
 * Polling rather than IMAP IDLE for now. IDLE holds one open connection per
 * tenant per folder, which is the right answer at scale but a different
 * lifecycle to manage.
 */
@Injectable()
export class MailboxSyncScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailboxSyncScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(SyncMailboxUseCase) private readonly syncMailbox: SyncMailboxUseCase,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.mailbox.syncEnabled) {
      // Off by default outside a deployment that wants it, so a local run does
      // not start dialling tenants' mail servers.
      this.logger.log('mailbox_sync_disabled');
      return;
    }

    this.timer = setInterval(() => {
      sweepSafely(this.logger, 'mailbox_sync', () => this.run());
    }, this.config.mailbox.syncIntervalSeconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<{ tenants: number; failed: number }> {
    // A slow mailbox must not have two syncs running against it at once: the
    // second would read from a cursor the first has not yet advanced and store
    // the same messages twice.
    if (this.running) {
      this.logger.warn('mailbox_sync_still_running');
      return { tenants: 0, failed: 0 };
    }

    this.running = true;
    try {
      const tenantIds = await this.credentials.listConnectedTenantIds();
      let failed = 0;

      for (const tenantId of tenantIds) {
        try {
          const summary = await this.syncMailbox.syncAllFolders(tenantId);
          if (summary.failed.length > 0) failed += 1;
        } catch (error) {
          failed += 1;
          // One tenant's broken mailbox must not stop everyone else's sync.
          this.logger.warn(
            `mailbox_sync_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }

      return { tenants: tenantIds.length, failed };
    } finally {
      this.running = false;
    }
  }
}
