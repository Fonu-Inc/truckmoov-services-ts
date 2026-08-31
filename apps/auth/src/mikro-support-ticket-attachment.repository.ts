import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SupportTicketAttachmentRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredSupportTicketAttachment,
  SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';

function toStored(r: SupportTicketAttachmentRecord): StoredSupportTicketAttachment {
  return {
    id: r.id,
    ticketId: r.ticketId,
    tenantId: r.tenantId,
    messageId: r.messageId,
    key: r.key,
    filename: r.filename,
    contentType: r.contentType,
    // PostgreSQL BIGINT is returned by the driver as bigint. API responses
    // must contain JSON-safe primitives; attachment sizes are bounded by the
    // upload limit, so converting to number is lossless here.
    sizeBytes: Number(r.sizeBytes),
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroSupportTicketAttachmentRepository implements SupportTicketAttachmentRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTicketId(ticketId: string): Promise<StoredSupportTicketAttachment[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      SupportTicketAttachmentRecord,
      { ticketId },
      { orderBy: { createdAt: 'asc' } },
    );
    return records.map(toStored);
  }

  async save(attachment: StoredSupportTicketAttachment): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SupportTicketAttachmentRecord, attachment as unknown as SupportTicketAttachmentRecord);
  }
}
