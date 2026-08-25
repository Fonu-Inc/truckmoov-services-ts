import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  MailMessageRecord,
  MailSyncStateRecord,
  MailThreadRecord,
  getAuthOrm,
} from '../auth/session/infrastructure/persistence/auth-orm';
import type { MailAddress, MailAttachment, MailMessage, MailThread } from './mailbox.domain';
import type { MailboxRepository, SyncState, ThreadPage } from './mailbox.repository';

function toMessage(record: MailMessageRecord): MailMessage {
  return {
    id: record.id,
    tenantId: record.tenantId,
    threadId: record.threadId,
    messageId: record.messageId,
    inReplyTo: record.inReplyTo,
    references: (record.references ?? []) as string[],
    folder: record.folder,
    subject: record.subject,
    from: record.fromAddress as MailAddress,
    to: (record.toAddresses ?? []) as MailAddress[],
    cc: (record.ccAddresses ?? []) as MailAddress[],
    bcc: (record.bccAddresses ?? []) as MailAddress[],
    bodyText: record.bodyText,
    bodyHtml: record.bodyHtml,
    attachments: (record.attachments ?? []) as MailAttachment[],
    sentAt: record.sentAt.toISOString(),
    receivedAt: record.receivedAt.toISOString(),
    seen: record.seen,
    uid: Number(record.uid ?? 0),
    deliveryStatus: (record.deliveryStatus ?? 'unknown') as MailMessage['deliveryStatus'],
    deliveryDetail: record.deliveryDetail ?? null,
  };
}

@Injectable()
export class MikroMailboxRepository implements MailboxRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findThreadIdsByMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (messageIds.length === 0) return new Map();

    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .fork()
      .find(MailMessageRecord, { tenantId, messageId: { $in: [...messageIds] } } as never);

    return new Map(rows.map((row) => [row.messageId, row.threadId]));
  }

  async saveMessages(messages: readonly MailMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    // Upsert on (tenant_id, message_id): a re-sync that re-reads the same
    // message must update it rather than store a second copy.
    await em.upsertMany(
      MailMessageRecord,
      messages.map((message) => ({
        id: message.id,
        tenantId: message.tenantId,
        threadId: message.threadId,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        references: message.references,
        folder: message.folder,
        subject: message.subject,
        fromAddress: message.from,
        toAddresses: message.to,
        ccAddresses: message.cc,
        bccAddresses: message.bcc,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        attachments: message.attachments,
        sentAt: new Date(message.sentAt),
        receivedAt: new Date(message.receivedAt),
        seen: message.seen,
        uid: message.uid,
        deliveryStatus: message.deliveryStatus,
        deliveryDetail: message.deliveryDetail,
      })),
      { onConflictFields: ['tenantId', 'messageId'] } as never,
    );
  }

  async saveThreads(threads: readonly MailThread[]): Promise<void> {
    if (threads.length === 0) return;

    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsertMany(
      MailThreadRecord,
      threads.map((thread) => ({
        id: thread.id,
        tenantId: thread.tenantId,
        subject: thread.subject,
        participants: thread.participants,
        messageCount: thread.messageCount,
        lastMessageAt: new Date(thread.lastMessageAt),
        hasUnread: thread.hasUnread,
        updatedAt: new Date(),
      })),
    );
  }

  async listThreads(tenantId: string, limit: number, offset: number): Promise<ThreadPage> {
    const orm = await getAuthOrm(this.config.db);
    const [rows, total] = await orm.em.fork().findAndCount(
      MailThreadRecord,
      { tenantId } as never,
      { orderBy: { lastMessageAt: 'desc' }, limit, offset },
    );

    return {
      total,
      threads: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        subject: row.subject,
        participants: (row.participants ?? []) as MailAddress[],
        messageCount: row.messageCount,
        lastMessageAt: row.lastMessageAt.toISOString(),
        hasUnread: row.hasUnread,
      })),
    };
  }

  async listMessagesInThread(tenantId: string, threadId: string): Promise<MailMessage[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .fork()
      .find(MailMessageRecord, { tenantId, threadId } as never, { orderBy: { sentAt: 'asc' } });

    return rows.map(toMessage);
  }

  async messagesForThreads(
    tenantId: string,
    threadIds: readonly string[],
  ): Promise<MailMessage[]> {
    if (threadIds.length === 0) return [];

    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .fork()
      .find(MailMessageRecord, { tenantId, threadId: { $in: [...threadIds] } } as never);

    return rows.map(toMessage);
  }

  async findByMessageId(tenantId: string, messageId: string): Promise<MailMessage | null> {
    const orm = await getAuthOrm(this.config.db);
    const row = await orm.em.fork().findOne(MailMessageRecord, { tenantId, messageId } as never);
    return row ? toMessage(row) : null;
  }

  async recordDelivery(
    tenantId: string,
    messageId: string,
    status: MailMessage['deliveryStatus'],
    detail: string | null,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em
      .fork()
      .nativeUpdate(
        MailMessageRecord,
        { tenantId, messageId } as never,
        { deliveryStatus: status, deliveryDetail: detail },
      );
  }

  async getSyncState(tenantId: string, folder: string): Promise<SyncState | null> {
    const orm = await getAuthOrm(this.config.db);
    const row = await orm.em.fork().findOne(MailSyncStateRecord, { tenantId, folder } as never);
    if (!row) return null;

    return {
      tenantId: row.tenantId,
      folder: row.folder,
      lastUid: Number(row.lastUid),
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  }

  async saveSyncState(state: SyncState): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsert(MailSyncStateRecord, {
      tenantId: state.tenantId,
      folder: state.folder,
      lastUid: state.lastUid,
      lastSyncedAt: state.lastSyncedAt ? new Date(state.lastSyncedAt) : null,
      lastError: state.lastError,
    });
  }
}
