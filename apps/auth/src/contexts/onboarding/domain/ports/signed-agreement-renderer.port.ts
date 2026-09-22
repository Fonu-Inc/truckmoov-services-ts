export const SIGNED_AGREEMENT_RENDERER = Symbol('SIGNED_AGREEMENT_RENDERER');

export type SignedAgreement = {
  title: string;
  body: string;
  templateVersion: string;
  templateHash: string;
  organizationName: string;
  applicationReference: string;
  signerName: string;
  signedAt: Date;
  ipAddress: string | null;
  signature: { bytes: Buffer; mimeType: string };
};

/**
 * Renders the agreement and the mark made on it into one file.
 *
 * The stored signature image and the template row are the evidence; this is
 * the readable copy of them, which is what a customer, a reviewer or a court
 * actually asks for.
 */
export interface SignedAgreementRenderer {
  render(agreement: SignedAgreement): Promise<Buffer>;
}
