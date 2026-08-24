import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SecretCipherService } from '@shared/crypto';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import { resolveThreadId, summariseThread, type MailMessage } from './mailbox.domain';
import { MAILBOX_READER, type MailboxReader } from './mailbox-reader.port';
import { MAILBOX_REPOSITORY, type MailboxRepository } from './mailbox.repository';

const DEFAULT_FOLDER = 'INBOX';
const MESSAGES_PER_SYNC = 100;

export type SyncResult = {
  tenantId: string;
  folder: string;
  fetched: number;
  threadsTouched: number;
  lastUid: number;
};

export type MailboxSyncSummary = {
  tenantId: string;
  folders: SyncResult[];
  failed: Array<{ folder: string; reason: string }>;
};

/**
 * Pulls new mail for one tenant and files it into threads.
 *
 * Deliberately holds no protocol knowledge: it asks a MailboxReader for
 * messages and a MailboxRepository to store them. That is what lets this run
 * wherever it is scheduled — inside this service today, in its own worker when
 * the volume justifies one — without the logic changing.
 */
@Injectable()
export class SyncMailboxUseCase {
  private readonly logger = new Logger(SyncMailboxUseCase.name);

  constructor(
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(MAILBOX_READER) private readonly reader: MailboxReader,
    @Inject(MAILBOX_REPOSITORY) private readonly repository: MailboxRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  /**
   * Syncs the folders the platform reads, each on its own cursor.
   *
   * Sent and Trash matter as much as the inbox: a reply the tenant sent from
   * their own mail client exists only in Sent, and a thread that shows only
   * inbound messages reads as though nobody ever answered.
   *
   * A folder that fails does not stop the rest. One unreachable folder should
   * not leave the inbox unsynced.
   */
  async syncAllFolders(tenantId: string): Promise<MailboxSyncSummary> {
    const stored = await this.credentials.findByTenant(tenantId);
    if (!stored) return { tenantId, folders: [], failed: [] };

    const folders = await this.reader.discoverFolders({
      host: stored.imap.host,
      port: stored.imap.port,
      username: stored.imap.username,
      password: this.cipher.decrypt(stored.imap.passwordCiphertext),
      secure: stored.imap.secure,
    });

    const wanted = [folders.inbox, folders.sent, folders.trash].filter(
      (folder): folder is string => Boolean(folder),
    );

    const results: SyncResult[] = [];
    const failed: Array<{ folder: string; reason: string }> = [];

    for (const folder of wanted) {
      try {
        results.push(await this.execute(tenantId, folder));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'sync failed';
        this.logger.warn(`mailbox_folder_sync_failed:${tenantId}:${folder}:${reason}`);
        failed.push({ folder, reason });
      }
    }

    return { tenantId, folders: results, failed };
  }

  async execute(tenantId: string, folder = DEFAULT_FOLDER): Promise<SyncResult> {
    const stored = await this.credentials.findByTenant(tenantId);
    if (!stored) {
      return { tenantId, folder, fetched: 0, threadsTouched: 0, lastUid: 0 };
    }

    const state = await this.repository.getSyncState(tenantId, folder);
    const sinceUid = state?.lastUid ?? 0;

    let fetched;
    try {
      fetched = await this.reader.fetchMessages({
        connection: {
          host: stored.imap.host,
          port: stored.imap.port,
          username: stored.imap.username,
          // The one place the password is recovered: to authenticate to the
          // server that owns it. It is never returned to a caller.
          password: this.cipher.decrypt(stored.imap.passwordCiphertext),
          secure: stored.imap.secure,
        },
        folder,
        sinceUid,
        limit: MESSAGES_PER_SYNC,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mailbox sync failed';
      // Recorded against the credential so the tenant sees why their mailbox
      // stopped updating, rather than it silently going quiet.
      await this.credentials.recordVerification(tenantId, null, message);
      await this.repository.saveSyncState({
        tenantId,
        folder,
        lastUid: sinceUid,
        lastSyncedAt: state?.lastSyncedAt ?? null,
        lastError: message,
      });
      throw error;
    }

    if (fetched.length === 0) {
      await this.markSynced(tenantId, folder, sinceUid);
      return { tenantId, folder, fetched: 0, threadsTouched: 0, lastUid: sinceUid };
    }

    const messages = await this.assignThreads(tenantId, fetched);
    await this.repository.saveMessages(messages);

    const threadIds = [...new Set(messages.map((message) => message.threadId))];
    await this.rebuildThreads(tenantId, threadIds);

    const lastUid = Math.max(sinceUid, ...fetched.map((message) => message.uid));
    await this.markSynced(tenantId, folder, lastUid);

    return {
      tenantId,
      folder,
      fetched: messages.length,
      threadsTouched: threadIds.length,
      lastUid,
    };
  }

  /**
   * Threads are resolved against what is already stored AND against the batch
   * being processed. Without the second, a reply arriving in the same batch as
   * the message it answers would start a thread of its own.
   */
  private async assignThreads(
    tenantId: string,
    fetched: Awaited<ReturnType<MailboxReader['fetchMessages']>>,
  ): Promise<MailMessage[]> {
    const lookupIds = [
      ...new Set(
        fetched.flatMap((message) => [
          ...message.references,
          ...(message.inReplyTo ? [message.inReplyTo] : []),
        ]),
      ),
    ];
    const known = await this.repository.findThreadIdsByMessageIds(tenantId, lookupIds);

    // Oldest first, so a parent is filed before the reply that refers to it.
    const ordered = [...fetched].sort((left, right) => left.sentAt.localeCompare(right.sentAt));

    return ordered.map((message) => {
      const threadId = resolveThreadId(message, known);
      known.set(message.messageId, threadId);
      return { ...message, id: randomUUID(), tenantId, threadId };
    });
  }

  /** Recomputed from every message in the thread, not just the new ones. */
  private async rebuildThreads(tenantId: string, threadIds: readonly string[]): Promise<void> {
    const all = await this.repository.messagesForThreads(tenantId, threadIds);
    const byThread = new Map<string, MailMessage[]>();
    for (const message of all) {
      const bucket = byThread.get(message.threadId) ?? [];
      bucket.push(message);
      byThread.set(message.threadId, bucket);
    }

    await this.repository.saveThreads(
      [...byThread.entries()].map(([threadId, messages]) =>
        summariseThread(threadId, tenantId, messages),
      ),
    );
  }

  private async markSynced(tenantId: string, folder: string, lastUid: number): Promise<void> {
    const now = new Date();
    await this.repository.saveSyncState({
      tenantId,
      folder,
      lastUid,
      lastSyncedAt: now.toISOString(),
      lastError: null,
    });
    await this.credentials.recordVerification(tenantId, now, null);
  }
}
