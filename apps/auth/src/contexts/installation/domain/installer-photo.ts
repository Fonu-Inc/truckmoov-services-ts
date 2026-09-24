import type { UploadedDocumentFile } from '@auth/onboarding/domain/onboarding-document-file';
import { inspectImage, type InspectedImage } from './installation-image';

export const MAX_INSTALLER_PHOTO_BYTES = 2 * 1024 * 1024;

export class InvalidInstallerPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInstallerPhotoError';
  }
}

export function inspectInstallerPhoto(file?: UploadedDocumentFile): InspectedImage {
  return inspectImage(
    file,
    { subject: 'Photo', maxBytes: MAX_INSTALLER_PHOTO_BYTES, formats: ['jpeg', 'png'] },
    (message) => new InvalidInstallerPhotoError(message),
  );
}
