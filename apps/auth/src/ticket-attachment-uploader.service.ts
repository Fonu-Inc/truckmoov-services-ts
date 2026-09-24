import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { AppConfigService } from '@shared/config';
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
import { TICKET_FILE_SCANNER, scanRefusal, type TicketFileScanner } from './ticket-file-scanner.port';

export type TicketAttachmentUpload = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

/** Strips path separators, `..`, and control characters; keeps the name readable. */
function sanitizeDisplayFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const printable = Array.from(base)
    .filter((char) => {
      const code = char.charCodeAt(0);
      // Strips control characters (0x00-0x1f, 0x7f) without a regex escape,
      // which is easy to get wrong and hard to review in a character class.
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
  const cleaned = printable.replace(/\.\./g, '.').trim();
  return (cleaned || 'file').slice(0, 128);
}

/**
 * The one place a ticket attachment is validated and stored, used by both
 * raising a ticket and replying to one — the requirements state both need
 * "the same limits."
 */
@Injectable()
export class TicketAttachmentUploaderService {
  private readonly scanRequired: boolean;

  constructor(
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
    @Inject(TICKET_FILE_SCANNER) private readonly scanner: TicketFileScanner,
    @Inject(SUPPORT_TICKET_ATTACHMENT_REPOSITORY)
    private readonly attachments: SupportTicketAttachmentRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.scanRequired = config.fleet.documentScanRequired;
  }

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
    const refusal = scanRefusal(verdict, this.scanRequired);
    if (refusal) throw new TicketAttachmentRejectedByScannerError(refusal);

    // Reserved before the bytes are written, so a refused upload leaves
    // nothing in the bucket to clean up.
    try {
      await this.storageQuota.assertRoomFor(input.tenantId, file.buffer.byteLength);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) throw error;
      throw error;
    }

    const id = this.idGenerator.generate();
    // The uploaded name never enters the key. It arrives from the client
    // unsanitized, and folding it into a storage path invites both path
    // traversal and key collisions from two files sharing a name — id alone
    // is already unique, and the readable name is kept in the filename column
    // for display and download.
    const key = `auth/support-tickets/${input.tenantId}/${input.ticketId}/${id}`;
    await this.storage.putObject({ key, body: file.buffer, contentType });
    await this.storageQuota.record(input.tenantId, 'support_tickets', file.buffer.byteLength);

    const attachment: StoredSupportTicketAttachment = {
      id,
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      messageId: input.messageId,
      key,
      // Kept only for display and as a download's suggested filename, so path
      // separators and control characters are stripped here too — the same
      // reason they are kept out of the storage key above.
      filename: sanitizeDisplayFilename(file.filename),
      contentType,
      sizeBytes: file.buffer.byteLength,
      uploadedBy: input.uploadedBy,
      createdAt: new Date(),
    };
    await this.attachments.save(attachment);
    return attachment;
  }
}
