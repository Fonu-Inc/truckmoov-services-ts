export class TicketAttachmentTooLargeError extends Error {
  constructor(sizeBytes: number, maxBytes: number) {
    super(`Attachment is ${sizeBytes} bytes, over the ${maxBytes} byte limit`);
    this.name = 'TicketAttachmentTooLargeError';
  }
}

export class TicketAttachmentTypeNotAllowedError extends Error {
  constructor(contentType: string) {
    super(`${contentType} is not an accepted attachment type`);
    this.name = 'TicketAttachmentTypeNotAllowedError';
  }
}

export class TicketAttachmentRejectedByScannerError extends Error {
  constructor(reason: string) {
    super(`Attachment rejected: ${reason}`);
    this.name = 'TicketAttachmentRejectedByScannerError';
  }
}

/**
 * Images, PDF, DOC, DOCX, TXT, CSV, XLS, XLSX — exactly what the requirements
 * name as accepted for a ticket attachment.
 */
export const ALLOWED_TICKET_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** Ticket attachments have their own, tighter cap regardless of the platform default. */
export const MAX_TICKET_ATTACHMENT_BYTES = 10 * 1024 * 1024;
