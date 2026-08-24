import { Injectable } from '@nestjs/common';
import type { MailMessage, MailThread } from './mailbox.domain';
import type { MailboxRepository, SyncState, ThreadPage } from './mailbox.repository';

/** Mirrors the Postgres repository's behaviour so the two cannot drift. */
@Injectable()
export class InMemoryMailboxRepository implements MailboxRepository {
  private readonly messages = new Map<string, MailMessage>();
  private readonly threads = new Map<string, MailThread>();
  private readonly syncState = new Map<string, SyncState>();

  private messageKey(tenantId: string, messageId: string) {
    return `${tenantId}::${messageId}`;
  }

  async findThreadIdsByMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const messageId of messageIds) {
      const message = this.messages.get(this.messageKey(tenantId, messageId));
      if (message) found.set(messageId, message.threadId);
    }
    return found;
  }

  async saveMessages(messages: readonly MailMessage[]): Promise<void> {
    for (const message of messages) {
      // Keyed by message id, not row id: re-reading the same message on a later
      // sync updates it instead of storing a duplicate.
      this.messages.set(this.messageKey(message.tenantId, message.messageId), { ...message });
    }
  }

  async saveThreads(threads: readonly MailThread[]): Promise<void> {
    for (const thread of threads) {
      this.threads.set(`${thread.tenantId}::${thread.id}`, { ...thread });
    }
  }

  async listThreads(tenantId: string, limit: number, offset: number): Promise<ThreadPage> {
    const all = [...this.threads.values()]
      .filter((thread) => thread.tenantId === tenantId)
      .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));

    return { threads: all.slice(offset, offset + limit), total: all.length };
  }

  async listMessagesInThread(tenantId: string, threadId: string): Promise<MailMessage[]> {
    return [...this.messages.values()]
      .filter((message) => message.tenantId === tenantId && message.threadId === threadId)
      .sort((left, right) => left.sentAt.localeCompare(right.sentAt));
  }

  async messagesForThreads(
    tenantId: string,
    threadIds: readonly string[],
  ): Promise<MailMessage[]> {
    const wanted = new Set(threadIds);
    return [...this.messages.values()].filter(
      (message) => message.tenantId === tenantId && wanted.has(message.threadId),
    );
  }

  async getSyncState(tenantId: string, folder: string): Promise<SyncState | null> {
    return this.syncState.get(`${tenantId}::${folder}`) ?? null;
  }

  async saveSyncState(state: SyncState): Promise<void> {
    this.syncState.set(`${state.tenantId}::${state.folder}`, { ...state });
  }
}
