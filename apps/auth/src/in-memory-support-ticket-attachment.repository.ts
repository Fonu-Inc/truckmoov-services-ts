import { Injectable } from '@nestjs/common';
import type {
  StoredSupportTicketAttachment,
  SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';

@Injectable()
export class InMemorySupportTicketAttachmentRepository implements SupportTicketAttachmentRepository {
  private readonly store: StoredSupportTicketAttachment[] = [];

  async findByTicketId(ticketId: string): Promise<StoredSupportTicketAttachment[]> {
    return this.store.filter((a) => a.ticketId === ticketId);
  }

  async save(attachment: StoredSupportTicketAttachment): Promise<void> {
    this.store.push(attachment);
  }

  async remove(id: string): Promise<void> {
    const index = this.store.findIndex((a) => a.id === id);
    if (index >= 0) this.store.splice(index, 1);
  }
}
