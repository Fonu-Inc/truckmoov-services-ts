import type { ObjectStorageService } from '@shared/object-storage';
import {
  findDocumentContradictions,
  type DocumentContradiction,
} from '@auth/onboarding/domain/document-contradictions';
import type { DocumentExtractor } from '@auth/onboarding/domain/ports/document-extraction.port';
import type {
  OnboardingApplicationRepository,
  OnboardingDocumentType,
  StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';

/**
 * Only the documents that carry an identifier the application also states.
 *
 * A utility bill or a request letter has nothing to contradict, and reading
 * every upload would put half a minute of OCR in front of an applicant for no
 * decision it could change.
 */
const DOCUMENTS_WORTH_READING: readonly OnboardingDocumentType[] = [
  'cac_document',
  'tax_certificate_or_tin',
  'identification_card',
];

/**
 * The last gate before an automatic approval.
 *
 * Registry answers decide; this only stops an approval where the paperwork
 * says something else. Deliberately not run when the checks already point to
 * rejection or review, because it could not change either outcome and the
 * applicant is waiting.
 */
export async function findContradictionsBeforeApproval(
  applications: OnboardingApplicationRepository,
  extractor: DocumentExtractor,
  storage: ObjectStorageService,
  application: StoredOnboardingApplication,
): Promise<DocumentContradiction[]> {
  const documents = (
    await applications.findDocumentsByApplicationId(application.id)
  ).filter((document) =>
    DOCUMENTS_WORTH_READING.includes(document.documentType),
  );

  const extractions = await Promise.all(
    documents.map(async (document) => {
      const bytes = await readBytes(storage, document.fileKey);
      if (!bytes) return null;

      return extractor.extract({
        documentId: document.id,
        documentType: document.documentType,
        mimeType: document.mimeType,
        bytes,
      });
    }),
  );

  return findDocumentContradictions(
    application,
    extractions.filter((extraction) => extraction !== null),
  );
}

async function readBytes(
  storage: ObjectStorageService,
  key: string,
): Promise<Buffer | null> {
  try {
    return await storage.getObject(key, 'private');
  } catch {
    // An unreadable file leaves the approval where the registries put it,
    // which is the same place it would be with no extractor at all.
    return null;
  }
}
