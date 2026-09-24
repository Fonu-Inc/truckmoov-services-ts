import { extname } from 'node:path';
import {
  UPLOADABLE_DOCUMENT_TYPES,
  type OnboardingDocumentType,
} from './onboarding-application.repository';
import { MAX_DOCUMENT_BYTES } from './onboarding-application.support';

export class InvalidDocumentFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentFileError';
  }
}

export type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type SniffedFormat = 'pdf' | 'jpeg' | 'png';

// The screens promise PDF, JPG and PNG only. The Customer Request Letter is
// additionally required to be a non-editable PDF.
const PDF_ONLY_TYPES = new Set<OnboardingDocumentType>([
  'customer_request_letter',
]);

const EXTENSIONS: Record<SniffedFormat, readonly string[]> = {
  pdf: ['.pdf'],
  jpeg: ['.jpg', '.jpeg'],
  png: ['.png'],
};

const MIME_TYPES: Record<SniffedFormat, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function validateDocumentType(value: unknown): OnboardingDocumentType {
  const candidate = String(value ?? '').trim();
  if (!(UPLOADABLE_DOCUMENT_TYPES as readonly string[]).includes(candidate)) {
    throw new InvalidDocumentFileError('Invalid or missing document_type');
  }
  return candidate as OnboardingDocumentType;
}

/**
 * The declared mime type and the file extension are both caller-supplied, so
 * the format is decided by the leading bytes and the other two only have to
 * agree with it.
 */
export function sniffDocumentFormat(buffer: Buffer): SniffedFormat {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) {
    return 'png';
  }
  throw new InvalidDocumentFileError(
    'File must be a PDF, JPG or PNG. Accepted formats: PDF, JPG, PNG (max 10MB each)',
  );
}

export function inspectDocumentFile(
  documentType: OnboardingDocumentType,
  file?: UploadedDocumentFile,
): { format: SniffedFormat; mimeType: string; extension: string; documentName: string } {
  if (!file?.buffer?.length) {
    throw new InvalidDocumentFileError('Missing upload file');
  }
  if (file.buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new InvalidDocumentFileError('File must be 10MB or smaller');
  }

  const format = sniffDocumentFormat(file.buffer);
  if (PDF_ONLY_TYPES.has(documentType) && format !== 'pdf') {
    throw new InvalidDocumentFileError(
      'This document must be supplied as a PDF',
    );
  }

  const extension = extname(file.originalname).toLowerCase();
  if (!EXTENSIONS[format].includes(extension)) {
    throw new InvalidDocumentFileError(
      `File contents are ${format.toUpperCase()} but the file name does not match`,
    );
  }

  return {
    format,
    mimeType: MIME_TYPES[format],
    extension,
    documentName: sanitizeDocumentName(file.originalname, extension),
  };
}

export function sanitizeDocumentName(
  originalName: string,
  extension: string,
): string {
  const base = originalName.slice(0, originalName.length - extension.length);
  const safeBase =
    base
      .replace(/[^a-zA-Z0-9-_ ]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-\s]+|[-\s]+$/g, '')
      .slice(0, 100) || 'document';
  return `${safeBase}${extension}`;
}
