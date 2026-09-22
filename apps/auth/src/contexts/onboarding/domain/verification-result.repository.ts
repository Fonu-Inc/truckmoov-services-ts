import type { KybCheckResult } from './ports/kyb-verification.port';

/**
 * A registry answer kept against the application it was asked for.
 *
 * An automated decision has to stay arguable months later: which registry was
 * asked, what it said, which fields were compared, and when. Without these
 * rows an approval is a status change nobody can explain.
 */
export type StoredVerificationResult = KybCheckResult & {
  id: string;
  applicationId: string;
};

export interface VerificationResultRepository {
  replaceForApplication(
    applicationId: string,
    results: StoredVerificationResult[],
  ): Promise<void>;
  findByApplicationId(
    applicationId: string,
  ): Promise<StoredVerificationResult[]>;
  deleteForApplication(applicationId: string): Promise<void>;
}

export const VERIFICATION_RESULT_REPOSITORY = Symbol(
  'VERIFICATION_RESULT_REPOSITORY',
);
