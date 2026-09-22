export const IDENTITY_CLAIM_TYPES = [
  'rc_number',
  'tax_identification_number',
  'identification_number',
  'document_hash',
] as const;
export type IdentityClaimType = (typeof IDENTITY_CLAIM_TYPES)[number];

/**
 * Something an application says identifies it, held separately so two
 * applications can be compared on it.
 *
 * The same registration number or the same uploaded file arriving under a
 * second email address is the signal being watched for: a different email is
 * free to create, a CAC certificate is not.
 */
export type StoredIdentityClaim = {
  id: string;
  applicationId: string;
  claimType: IdentityClaimType;
  claimValue: string;
  createdAt: Date;
};

export type IdentityClaimInput = {
  claimType: IdentityClaimType;
  claimValue: string;
};

export interface IdentityClaimRepository {
  /**
   * Makes the stored claims for an application exactly `claims`.
   *
   * Replacing rather than adding is what stops a claim surviving the edit that
   * removed it — an applicant who corrects a mistyped RC number must not keep
   * blocking whoever really owns the one they typed first.
   */
  replaceForApplication(
    applicationId: string,
    claims: IdentityClaimInput[],
  ): Promise<void>;
  findConflicts(
    claims: IdentityClaimInput[],
    excludingApplicationId: string,
  ): Promise<StoredIdentityClaim[]>;
  deleteForApplication(applicationId: string): Promise<void>;
}

export const IDENTITY_CLAIM_REPOSITORY = Symbol('IDENTITY_CLAIM_REPOSITORY');
