export const INDEMNITY_SIGNATURE_METHODS = ['drawn', 'uploaded'] as const;
export type IndemnitySignatureMethod =
  (typeof INDEMNITY_SIGNATURE_METHODS)[number];

/**
 * A version of the indemnity agreement as it was shown to applicants.
 *
 * Templates are added, never edited: an agreement signed against version 1 has
 * to stay readable exactly as it was worded then, whatever legal changes next.
 */
export type StoredIndemnityTemplate = {
  id: string;
  version: string;
  title: string;
  body: string;
  /** SHA-256 of `body`, recorded on each signature so wording can be proven. */
  bodyHash: string;
  isActive: boolean;
  createdAt: Date;
};

export type StoredIndemnitySignature = {
  id: string;
  applicationId: string;
  templateVersion: string;
  templateHash: string;
  signerName: string;
  method: IndemnitySignatureMethod;
  fileKey: string;
  mimeType: string;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: Date;
};

export interface IndemnityAgreementRepository {
  saveTemplate(template: StoredIndemnityTemplate): Promise<void>;
  findTemplateByVersion(
    version: string,
  ): Promise<StoredIndemnityTemplate | null>;
  findActiveTemplate(): Promise<StoredIndemnityTemplate | null>;

  saveSignature(signature: StoredIndemnitySignature): Promise<void>;
  findSignatureByApplicationId(
    applicationId: string,
  ): Promise<StoredIndemnitySignature | null>;
  deleteSignatureByApplicationId(applicationId: string): Promise<void>;
}

export const INDEMNITY_AGREEMENT_REPOSITORY = Symbol(
  'INDEMNITY_AGREEMENT_REPOSITORY',
);
