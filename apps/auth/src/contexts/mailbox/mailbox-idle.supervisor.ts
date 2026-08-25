import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SecretCipherService } from '@shared/crypto';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import { MAILBOX_READER, type MailboxReader } from './mailbox-reader.port';
import { MAILBOX_WATCHER, type MailboxWatcher, type StopWatching } from './mailbox-watcher.port';
import { SyncMailboxUseCase } from './sync-mailbox.use-case';

type Watch = {
  tenantId: string;
  folder: string;
  stop: StopWatching;
  retries: number;
  pending: NodeJS.Timeout | null;
};

/** New mail often arrives in bursts. One sync after the burst, not one per message. */
const SYNC_DEBOUNCE_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 5_000;

/**
 * Keeps a held-open connection on each tenant's inbox and syncs when the server
 * announces new mail.
 *
 * Only the inbox is watched. A watch costs one connection per mailbox held open
 * for as long as the service runs, so it is spent where someone is waiting on
 * the mail. Sent and Trash stay on the poll, where minutes of latency cost
 * nothing.
 *
 * The poll is not replaced. It remains the safety net: an announcement can be
 * missed while a connection is down, and the next poll picks up whatever the
 * watch did not.
 */
@Injectable()
export class MailboxIdleSupervisor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailboxIdleSupervisor.name);
  private readonly watches = new Map<string, Watch>();
  private readonly retryTimers = new Set<NodeJS.Timeout>();
  private shuttingDown = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(MAILBOX_READER) private readonly reader: MailboxReader,
    @Inject(MAILBOX_WATCHER) private readonly watcher: MailboxWatcher,
    @Inject(SyncMailboxUseCase) private readonly syncMailbox: SyncMailboxUseCase,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.mailbox.idleEnabled) {
      this.logger.log('mailbox_idle_disabled');
      return;
    }
    await this.startAll();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();

    for (const watch of this.watches.values()) {
      if (watch.pending) clearTimeout(watch.pending);
      await watch.stop().catch(() => {});
    }
    this.watches.clear();
  }

  async startAll(): Promise<{ watching: number; skipped: number }> {
    const tenantIds = await this.credentials.listConnectedTenantIds();
    // Bounded on purpose: each watch is a socket held open for the lifetime of
    // the process, so an unbounded tenant count would exhaust file descriptors
    // long before it exhausted anything else.
    const capacity = this.config.mailbox.maxIdleConnections;
    let watching = 0;

    for (const tenantId of tenantIds) {
      if (watching >= capacity) break;
      if (await this.startWatch(tenantId)) watching += 1;
    }

    const skipped = tenantIds.length - watching;
    if (skipped > 0) {
      // Said out loud rather than silently degrading: those tenants are on the
      // poll alone, which is correct but slower, and someone should know.
      this.logger.warn(`mailbox_idle_capacity_reached:watching=${watching}:polling=${skipped}`);
    }

    return { watching, skipped };
  }

  private async startWatch(tenantId: string): Promise<boolean> {
    if (this.shuttingDown || this.watches.has(tenantId)) return false;

    const stored = await this.credentials.findByTenant(tenantId);
    if (!stored) return false;

    const connection = {
      host: stored.imap.host,
      port: stored.imap.port,
      username: stored.imap.username,
      password: this.decryptOrNull(stored.imap.passwordCiphertext),
      secure: stored.imap.secure,
    };
    if (!connection.password) return false;

    try {
      const folders = await this.reader.discoverFolders({
        ...connection,
        password: connection.password,
      });

      const watch: Watch = {
        tenantId,
        folder: folders.inbox,
        retries: 0,
        pending: null,
        stop: async () => {},
      };
      this.watches.set(tenantId, watch);

      watch.stop = await this.watcher.watch({
        connection: { ...connection, password: connection.password },
        folder: folders.inbox,
        onNewMail: () => this.scheduleSync(watch),
        onDropped: (reason) => this.handleDrop(tenantId, reason),
      });

      this.logger.log(`mailbox_idle_started:${tenantId}:${folders.inbox}`);
      return true;
    } catch (error) {
      this.watches.delete(tenantId);
      this.logger.warn(
        `mailbox_idle_start_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      // Not retried here. The poll still covers this tenant, and a mailbox that
      // refuses a connection now will usually still refuse it in five seconds.
      return false;
    }
  }

  /** Collapses a burst of announcements into one sync. */
  private scheduleSync(watch: Watch): void {
    if (watch.pending) clearTimeout(watch.pending);
    watch.pending = setTimeout(() => {
      watch.pending = null;
      void this.syncNow(watch);
    }, SYNC_DEBOUNCE_MS);
  }

  private async syncNow(watch: Watch): Promise<void> {
    try {
      const result = await this.syncMailbox.execute(watch.tenantId, watch.folder);
      if (result.fetched > 0) {
        this.logger.log(`mailbox_idle_sync:${watch.tenantId}:fetched=${result.fetched}`);
      }
    } catch (error) {
      this.logger.warn(
        `mailbox_idle_sync_failed:${watch.tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private handleDrop(tenantId: string, reason: string): void {
    if (this.shuttingDown) return;

    const watch = this.watches.get(tenantId);
    this.watches.delete(tenantId);
    if (watch?.pending) clearTimeout(watch.pending);

    const retries = (watch?.retries ?? 0) + 1;
    // Backed off, because a mailbox rejecting connections would otherwise be
    // reconnected to in a tight loop and look like an attack from our side.
    const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (retries - 1), MAX_RETRY_DELAY_MS);
    this.logger.warn(`mailbox_idle_dropped:${tenantId}:${reason}:retry_in=${delay}ms`);

    const timer = setTimeout(() => {
      this.retryTimers.delete(timer);
      void this.startWatch(tenantId).then((started) => {
        const restarted = this.watches.get(tenantId);
        if (started && restarted) restarted.retries = retries;
      });
    }, delay);
    this.retryTimers.add(timer);
  }

  private decryptOrNull(ciphertext: string): string | null {
    try {
      return this.cipher.decrypt(ciphertext);
    } catch (error) {
      this.logger.error(
        `mailbox_idle_decrypt_failed:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
}
