export type StoredSupportTicketAttachment = {
  id: string;
  ticketId: string;
  tenantId: string;
  /** Set when the attachment came with a reply rather than the original ticket. */
  messageId: string | null;
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: Date;
};

export interface SupportTicketAttachmentRepository {
  findByTicketId(ticketId: string): Promise<StoredSupportTicketAttachment[]>;
  save(attachment: StoredSupportTicketAttachment): Promise<void>;
}

export const SUPPORT_TICKET_ATTACHMENT_REPOSITORY = Symbol('SUPPORT_TICKET_ATTACHMENT_REPOSITORY');
