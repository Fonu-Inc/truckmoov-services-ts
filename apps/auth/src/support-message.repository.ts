export type StoredSupportMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string | null;
  senderRole: string;
  message: string;
  isInternal: boolean;
  createdAt: Date;
};

export interface SupportMessageRepository {
  findByTicketId(ticketId: string): Promise<StoredSupportMessage[]>;
  save(message: StoredSupportMessage): Promise<void>;
}

export const SUPPORT_MESSAGE_REPOSITORY = Symbol('SUPPORT_MESSAGE_REPOSITORY');
