import { Inject, Injectable } from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SupportTicketCsatRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  TicketCsatAlreadySubmittedError,
  type StoredSupportTicketCsat,
  type SupportTicketCsatRepository,
} from './support-ticket-csat.repository';

@Injectable()
export class MikroSupportTicketCsatRepository implements SupportTicketCsatRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTicketId(ticketId: string): Promise<StoredSupportTicketCsat | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em.fork().findOne(SupportTicketCsatRecord, { ticketId });
    return record ? { ...record } : null;
  }

  async insert(csat: StoredSupportTicketCsat): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    try {
      await orm.em.fork().insert(SupportTicketCsatRecord, csat);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new TicketCsatAlreadySubmittedError();
      throw error;
    }
  }
}
