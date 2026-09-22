import type { OnboardingDocumentType } from '../onboarding-application.repository';

export const EXTRACTION_FIELDS = [
  'organization_name',
  'rc_number',
  'tax_identification_number',
  'identification_number',
  'address',
  'issued_on',
] as const;
export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];

export type ExtractedField = {
  field: ExtractionField;
  value: string | null;
  /**
   * 0 to 1. A field the two passes disagreed on scores 0, which is what keeps
   * a flaky read out of an automated decision.
   */
  confidence: number;
};

export type DocumentExtraction = {
  documentId: string;
  documentType: OnboardingDocumentType;
  fields: ExtractedField[];
  /** Named and versioned so a re-run years later can be compared to this one. */
  engine: string;
  engineVersion: string;
  extractedAt: Date;
};

export type DocumentToExtract = {
  documentId: string;
  documentType: OnboardingDocumentType;
  mimeType: string;
  bytes: Buffer;
};

/**
 * Reads the fields off an uploaded document.
 *
 * This is the fallback for what no registry can answer — a utility bill, a
 * request letter, a signature card. Production accuracy on real Nigerian
 * paperwork runs well below what the vendors advertise, so an extraction is
 * never authoritative on its own: it can contradict a registry answer, or
 * support one, but a decision is never made on it alone.
 *
 * The result is a derived record. The stored file is the legal artifact and is
 * never altered by extraction, so a disputed read can always be re-run against
 * the original.
 */
export interface DocumentExtractor {
  extract(document: DocumentToExtract): Promise<DocumentExtraction>;
}

export const DOCUMENT_EXTRACTOR = Symbol('DOCUMENT_EXTRACTOR');
