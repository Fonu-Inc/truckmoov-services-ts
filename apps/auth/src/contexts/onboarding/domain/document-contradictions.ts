import type { DocumentExtraction } from './ports/document-extraction.port';
import type { StoredOnboardingApplication } from './onboarding-application.repository';

/**
 * Below this an extraction is a guess, and a guess must not stop an approval.
 *
 * A field the two passes disagreed on scores zero and is excluded here by the
 * same rule, which is the point of reading each document twice.
 */
export const CONTRADICTION_CONFIDENCE_FLOOR = 0.6;

export type DocumentContradiction = {
  documentId: string;
  field: string;
  claimed: string;
  read: string;
};

/**
 * Where a document plainly says something other than what was typed.
 *
 * Only identifiers are compared, and only exactly: names on Nigerian paperwork
 * vary in ways OCR cannot be trusted to judge, so comparing them here would
 * manufacture contradictions out of "LIMITED" against "Ltd".
 */
export function findDocumentContradictions(
  application: StoredOnboardingApplication,
  extractions: DocumentExtraction[],
): DocumentContradiction[] {
  const claims: { field: string; claimed: string | null }[] = [
    { field: 'rc_number', claimed: application.rcNumber },
    {
      field: 'tax_identification_number',
      claimed: application.taxIdentificationNumber,
    },
    { field: 'identification_number', claimed: application.identificationNumber },
  ];

  const contradictions: DocumentContradiction[] = [];

  for (const extraction of extractions) {
    for (const { field, claimed } of claims) {
      if (!claimed) continue;

      const read = extraction.fields.find((entry) => entry.field === field);
      if (
        !read?.value ||
        read.confidence < CONTRADICTION_CONFIDENCE_FLOOR ||
        normalize(read.value) === normalize(claimed)
      ) {
        continue;
      }

      contradictions.push({
        documentId: extraction.documentId,
        field,
        claimed,
        read: read.value,
      });
    }
  }

  return contradictions;
}

function normalize(value: string): string {
  return value.replace(/[\s\-/]/g, '').toUpperCase();
}
