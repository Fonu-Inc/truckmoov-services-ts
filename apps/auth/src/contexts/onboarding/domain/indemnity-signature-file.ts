import { extname } from 'node:path';
import {
  InvalidDocumentFileError,
  sniffDocumentFormat,
  sanitizeDocumentName,
  type UploadedDocumentFile,
} from './onboarding-document-file';

// A signature is a drawn or photographed mark, never a document. Accepting a
// PDF here would let an applicant file something the signature panel cannot
// render back to them or to a reviewer.
const SIGNATURE_MIME_TYPES = { jpeg: 'image/jpeg', png: 'image/png' } as const;

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export function inspectSignatureFile(file?: UploadedDocumentFile): {
  mimeType: string;
  extension: string;
  documentName: string;
} {
  if (!file?.buffer?.length) {
    throw new InvalidDocumentFileError('Missing signature image');
  }
  if (file.buffer.byteLength > MAX_SIGNATURE_BYTES) {
    throw new InvalidDocumentFileError('Signature image must be 2MB or smaller');
  }

  const format = sniffDocumentFormat(file.buffer);
  if (format === 'pdf') {
    throw new InvalidDocumentFileError('Signature must be a JPG or PNG image');
  }

  const extension = extname(file.originalname).toLowerCase() || `.${format}`;
  return {
    mimeType: SIGNATURE_MIME_TYPES[format],
    extension,
    documentName: sanitizeDocumentName(file.originalname, extension),
  };
}
