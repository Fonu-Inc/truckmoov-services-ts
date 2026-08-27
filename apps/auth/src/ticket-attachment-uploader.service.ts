import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { ID_GENERATOR } from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import {
  ALLOWED_TICKET_ATTACHMENT_TYPES,
  MAX_TICKET_ATTACHMENT_BYTES,
  TicketAttachmentRejectedByScannerError,
  TicketAttachmentTooLargeError,
  TicketAttachmentTypeNotAllowedError,
} from './support-ticket-attachment.errors';
import { StorageQuotaExceededError } from './storage-usage.repository';
import { StorageQuotaService } from './storage-quota.service';
import type { StoredSupportTicketAttachment } from './support-ticket-attachment.repository';
import {
  SUPPORT_TICKET_ATTACHMENT_REPOSITORY,
  type SupportTicketAttachmentRepository,
} from './support-ticket-attachment.repository';
import { TICKET_FILE_SCANNER, type TicketFileScanner } from './ticket-file-scanner.port';

export type TicketAttachmentUpload = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

/**
 * The one place a ticket attachment is validated and stored, used by both
 * raising a ticket and replying to one — the requirements state both need
 * "the same limits."
 */
@Injectable()
export class TicketAttachmentUploaderService {
  constructor(
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
    @Inject(TICKET_FILE_SCANNER) private readonly scanner: TicketFileScanner,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY)
    private readonly attachments: SupportTicketAttachmentRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async upload(input: {
    tenantId: string;
    ticketId: string;
    messageId: string | null;
    uploadedBy: string;
    files: TicketAttachmentUpload[];
  }): Promise<StoredSupportTicketAttachment[]> {
    const saved: StoredSupportTicketAttachment[] = [];
    for (const file of input.files) {
      saved.push(await this.uploadOne(input, file));
    }
    return saved;
  }

  private async uploadOne(
    input: { tenantId: string; ticketId: string; messageId: string | null; uploadedBy: string },
    file: TicketAttachmentUpload,
  ): Promise<StoredSupportTicketAttachment> {
    if (file.buffer.byteLength > MAX_TICKET_ATTACHMENT_BYTES) {
      throw new TicketAttachmentTooLargeError(file.buffer.byteLength, MAX_TICKET_ATTACHMENT_BYTES);
    }
    const contentType = file.contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TICKET_ATTACHMENT_TYPES.includes(contentType as never)) {
      throw new TicketAttachmentTypeNotAllowedError(file.contentType);
    }

    const verdict = await this.scanner.scan(file.filename, contentType, file.buffer);
    if (verdict.scanned && !verdict.clean) {
      throw new TicketAttachmentRejectedByScannerError(verdict.reason ?? 'flagged by scanner');
    }

    // Reserved before the bytes are written, so a refused upload leaves
    // nothing in the bucket to clean up.
    try {
      await this.storageQuota.assertRoomFor(input.tenantId, file.buffer.byteLength);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) throw error;
      throw error;
    }

    const id = this.idGenerator.generate();
    const key = `auth/support-tickets/${input.tenantId}/${input.ticketId}/${id}-${file.filename}`;
    await this.storage.putObject({ key, body: file.buffer, contentType });
    await this.storageQuota.record(input.tenantId, 'support_tickets', file.buffer.byteLength);

    const attachment: StoredSupportTicketAttachment = {
      id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      messageId: input.messageId,
      key,
      filename: file.filename,
      contentType,
      sizeBytes: file.buffer.byteLength,
      uploadedBy: input.uploadedBy,
      createdAt: new Date(),
    };
    await this.attachments.save(attachment);
    return attachment;
  }
}
