import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import type { InstallerTicketFiles } from '@auth/installation/domain/ports/installer-ticket-files.port';

const TICKET_FILE_URL_TTL_SECONDS = 300;

@Injectable()
export class ObjectStorageInstallerTicketFiles implements InstallerTicketFiles {
  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

  async store(key: string, file: { buffer: Buffer; mimeType: string }): Promise<void> {
    await this.storage.putObject({ key, body: file.buffer, contentType: file.mimeType, visibility: 'private' });
  }

  async remove(key: string): Promise<void> {
    await this.storage.deleteObject(key);
  }

  downloadUrl(key: string): Promise<string> {
    return this.storage.createPresignedDownloadUrl({ key, expiresIn: TICKET_FILE_URL_TTL_SECONDS });
  }
}
