import { Injectable } from '@nestjs/common';
import {
  TicketCsatAlreadySubmittedError,
  type StoredSupportTicketCsat,
  type SupportTicketCsatRepository,
} from './support-ticket-csat.repository';

@Injectable()
export class InMemorySupportTicketCsatRepository implements SupportTicketCsatRepository {
  private readonly store = new Map<string, StoredSupportTicketCsat>();

  async findByTicketId(ticketId: string): Promise<StoredSupportTicketCsat | null> {
    return this.store.get(ticketId) ?? null;
  }

  async insert(csat: StoredSupportTicketCsat): Promise<void> {
    if (this.store.has(csat.ticketId)) throw new TicketCsatAlreadySubmittedError();
    this.store.set(csat.ticketId, csat);
  }
}
