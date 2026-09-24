import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import type { InstallerPhotoStorage } from '@auth/installation/domain/ports/installer-photo-storage.port';

const PHOTO_URL_TTL_SECONDS = 300;

@Injectable()
export class ObjectStorageInstallerPhotos implements InstallerPhotoStorage {
  private readonly logger = new Logger(ObjectStorageInstallerPhotos.name);

  constructor(@Inject(ObjectStorageService) private readonly storage: ObjectStorageService) {}

  async store(
    installerId: string,
    photo: { buffer: Buffer; mimeType: string; extension: string },
  ): Promise<string> {
    const key = `auth/installers/${installerId}/photo/${randomUUID()}${photo.extension}`;
    await this.storage.putObject({ key, body: photo.buffer, contentType: photo.mimeType, visibility: 'private' });
    return key;
  }

  async remove(key: string): Promise<void> {
    await this.storage.deleteObject(key, 'private');
  }

  async url(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.storage.createPresignedDownloadUrl({ key, expiresIn: PHOTO_URL_TTL_SECONDS });
    } catch (error) {
      this.logger.warn(`installer_photo_url_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }
}
