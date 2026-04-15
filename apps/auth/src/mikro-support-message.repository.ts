import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SupportMessageRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { StoredSupportMessage, SupportMessageRepository } from './support-message.repository';

function toStored(r: SupportMessageRecord): StoredSupportMessage {
  return {
    id: r.id,
    ticketId: r.ticketId,
    senderId: r.senderId,
    senderName: r.senderName,
    senderRole: r.senderRole,
    message: r.message,
    isInternal: r.isInternal,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroSupportMessageRepository implements SupportMessageRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTicketId(ticketId: string): Promise<StoredSupportMessage[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(SupportMessageRecord, { ticketId }, { orderBy: { createdAt: 'asc' } });
    return records.map(toStored);
  }

  async save(message: StoredSupportMessage): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SupportMessageRecord, message as unknown as SupportMessageRecord);
  }
}
