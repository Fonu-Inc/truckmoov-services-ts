import type { MailMessage, MailThread } from './mailbox.domain';

export type SyncState = {
  tenantId: string;
  folder: string;
  lastUid: number;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type ThreadPage = {
  threads: MailThread[];
  total: number;
};

/**
 * Persistence for the aggregated mailbox.
 *
 * Every method is tenant-scoped. A mailbox belongs to one organisation and
 * there is no cross-tenant read on this interface at all.
 */
export interface MailboxRepository {
  findThreadIdsByMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, string>>;
  saveMessages(messages: readonly MailMessage[]): Promise<void>;
  saveThreads(threads: readonly MailThread[]): Promise<void>;
  listThreads(tenantId: string, limit: number, offset: number): Promise<ThreadPage>;
  /**
   * Threads that changed after a cursor.
   *
   * This is what makes a missed push recoverable. The socket is at-most-once:
   * a message announced while a laptop was shut is gone. On reconnect the
   * client asks from its last cursor and gets everything it missed.
   */
  listThreadsSince(tenantId: string, since: string, limit: number): Promise<ThreadPage>;
  listMessagesInThread(tenantId: string, threadId: string): Promise<MailMessage[]>;
  messagesForThreads(tenantId: string, threadIds: readonly string[]): Promise<MailMessage[]>;
  findByMessageId(tenantId: string, messageId: string): Promise<MailMessage | null>;
  recordDelivery(
    tenantId: string,
    messageId: string,
    status: MailMessage['deliveryStatus'],
    detail: string | null,
  ): Promise<void>;
  getSyncState(tenantId: string, folder: string): Promise<SyncState | null>;
  saveSyncState(state: SyncState): Promise<void>;
}

export const MAILBOX_REPOSITORY = Symbol('MAILBOX_REPOSITORY');
