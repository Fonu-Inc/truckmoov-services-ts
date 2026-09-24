import {
  InvalidDocumentFileError,
  sniffDocumentFormat,
  type UploadedDocumentFile,
} from '@auth/onboarding/domain/onboarding-document-file';

export const MAX_INSTALLER_PHOTO_BYTES = 2 * 1024 * 1024;

const PHOTO_TYPES = {
  jpeg: { mimeType: 'image/jpeg', extension: '.jpg' },
  png: { mimeType: 'image/png', extension: '.png' },
} as const;

export class InvalidInstallerPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInstallerPhotoError';
  }
}

function sniffed(buffer: Buffer): 'jpeg' | 'png' | 'pdf' | null {
  try {
    return sniffDocumentFormat(buffer);
  } catch (error) {
    if (error instanceof InvalidDocumentFileError) return null;
    throw error;
  }
}

/** A JPG or PNG up to 2 MB, decided by its leading bytes rather than what the client says it is. */
export function inspectInstallerPhoto(file?: UploadedDocumentFile): {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  extension: string;
} {
  if (!file?.buffer?.length) throw new InvalidInstallerPhotoError('Missing photo');
  if (file.buffer.byteLength > MAX_INSTALLER_PHOTO_BYTES) {
    throw new InvalidInstallerPhotoError('Photo must be 2MB or smaller');
  }
  const format = sniffed(file.buffer);
  if (format !== 'jpeg' && format !== 'png') {
    throw new InvalidInstallerPhotoError('Photo must be a JPG or PNG image');
  }
  return { buffer: file.buffer, filename: file.originalname, ...PHOTO_TYPES[format] };
}
