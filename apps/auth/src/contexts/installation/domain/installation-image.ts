import {
  InvalidDocumentFileError,
  sniffDocumentFormat,
  type UploadedDocumentFile,
} from '@auth/onboarding/domain/onboarding-document-file';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export type InspectedImage = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  extension: string;
};

export type ImagePolicy = {
  subject: string;
  maxBytes: number;
  formats: readonly ImageFormat[];
};

const IMAGE_TYPES: Record<ImageFormat, { mimeType: string; extension: string; label: string }> = {
  jpeg: { mimeType: 'image/jpeg', extension: '.jpg', label: 'JPG' },
  png: { mimeType: 'image/png', extension: '.png', label: 'PNG' },
  webp: { mimeType: 'image/webp', extension: '.webp', label: 'WebP' },
};

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
  if (isWebp(buffer)) return 'webp';
  try {
    const format = sniffDocumentFormat(buffer);
    return format === 'pdf' ? null : format;
  } catch (error) {
    if (error instanceof InvalidDocumentFileError) return null;
    throw error;
  }
}

function formatList(formats: readonly ImageFormat[]): string {
  const labels = formats.map((format) => IMAGE_TYPES[format].label);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels[0];
}

/** Decided by the leading bytes, never by what the client says the file is. */
export function inspectImage(
  file: UploadedDocumentFile | undefined,
  policy: ImagePolicy,
  refuse: (message: string) => Error,
): InspectedImage {
  if (!file?.buffer?.length) throw refuse(`Missing ${policy.subject.toLowerCase()}`);
  if (file.buffer.byteLength > policy.maxBytes) {
    throw refuse(`${policy.subject} must be ${policy.maxBytes / (1024 * 1024)}MB or smaller`);
  }
  const format = sniffImageFormat(file.buffer);
  if (!format || !policy.formats.includes(format)) {
    throw refuse(`${policy.subject} must be a ${formatList(policy.formats)} image`);
  }
  const { mimeType, extension } = IMAGE_TYPES[format];
  return { buffer: file.buffer, filename: file.originalname, mimeType, extension };
}
