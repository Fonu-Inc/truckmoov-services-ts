import { Injectable } from '@nestjs/common';
import type { StoredSupportMessage, SupportMessageRepository } from './support-message.repository';

@Injectable()
export class InMemorySupportMessageRepository implements SupportMessageRepository {
  private readonly store = new Map<string, StoredSupportMessage>();

  async findByTicketId(ticketId: string): Promise<StoredSupportMessage[]> {
    return [...this.store.values()]
      .filter((m) => m.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async save(message: StoredSupportMessage): Promise<void> {
    this.store.set(message.id, message);
  }
}
