import { Inject, Injectable } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import type { InstallationEvidenceStorage } from '@auth/installation/domain/ports/installation-evidence-storage.port';

const EVIDENCE_URL_TTL_SECONDS = 300;

@Injectable()
export class ObjectStorageInstallationEvidence implements InstallationEvidenceStorage {
  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

  async store(key: string, file: { buffer: Buffer; mimeType: string }): Promise<void> {
    await this.storage.putObject({ key, body: file.buffer, contentType: file.mimeType, visibility: 'private' });
  }

  downloadUrl(key: string): Promise<string> {
    return this.storage.createPresignedDownloadUrl({ key, expiresIn: EVIDENCE_URL_TTL_SECONDS });
  }
}
