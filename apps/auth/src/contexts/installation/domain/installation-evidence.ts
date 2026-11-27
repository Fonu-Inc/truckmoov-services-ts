import { extname } from 'node:path';
import {
  sanitizeDocumentName,
  type UploadedDocumentFile,
} from '@auth/onboarding/domain/onboarding-document-file';
import { inspectImage, type InspectedImage } from './installation-image';

/** The full list is still with the product team; only this one is on the screens. */
export const EVIDENCE_CATEGORIES = {
  device_installation: 'Device installation',
} as const;
export type EvidenceCategory = keyof typeof EVIDENCE_CATEGORIES;

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export class InvalidEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEvidenceError';
  }
}

export function evidenceCategory(value: unknown): EvidenceCategory {
  const candidate = String(value ?? '').trim();
  if (!Object.keys(EVIDENCE_CATEGORIES).includes(candidate)) {
    throw new InvalidEvidenceError(`category must be one of: ${Object.keys(EVIDENCE_CATEGORIES).join(', ')}`);
  }
  return candidate as EvidenceCategory;
}

export function inspectEvidencePhoto(file?: UploadedDocumentFile): InspectedImage {
  return inspectImage(
    file,
    { subject: 'Evidence photo', maxBytes: MAX_EVIDENCE_BYTES, formats: ['jpeg', 'png', 'webp'] },
    (message) => new InvalidEvidenceError(message),
  );
}

/** The uploaded name made safe for a storage key, with the extension its bytes decided. */
export function evidenceFileName(originalName: string, extension: string): string {
  const base = originalName.slice(0, originalName.length - extname(originalName).length);
  return sanitizeDocumentName(`${base}${extension}`, extension).replace(/\s+/g, '-');
}

export function evidenceKey(parts: {
  tenantId: string;
  orderId: string;
  category: EvidenceCategory;
  id: string;
  fileName: string;
}): string {
  return `${parts.tenantId}/installations/${parts.orderId}/evidence/${parts.category}/${parts.id}-${parts.fileName}`;
}

export function evidenceFileNameOf(key: string, id: string): string {
  const last = key.slice(key.lastIndexOf('/') + 1);
  return last.startsWith(`${id}-`) ? last.slice(id.length + 1) : last;
}

export const VEHICLE_NOT_ON_JOB = "vehicleId must be one of this job's vehicles";

/** Vehicles with at least one photo; a legacy photo (no vehicle) covers all of them. */
export function coveredVehicles(evidence: { vehicleId: string | null }[], vehicleIds: string[]): number {
  if (evidence.some((item) => item.vehicleId === null)) return vehicleIds.length;
  const photographed = new Set(evidence.map((item) => item.vehicleId));
  return vehicleIds.filter((id) => photographed.has(id)).length;
}
