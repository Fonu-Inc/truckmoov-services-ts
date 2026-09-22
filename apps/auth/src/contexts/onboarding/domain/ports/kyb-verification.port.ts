export const KYB_VERIFICATION_CHECKS = [
  'cac_registration',
  'tax_identification',
  'identity',
  'vehicle_registration',
] as const;
export type KybVerificationCheck = (typeof KYB_VERIFICATION_CHECKS)[number];

export const KYB_VERDICTS = [
  /** The registry confirmed the detail and it matches what was submitted. */
  'match',
  /** The registry answered, and the answer contradicts what was submitted. */
  'mismatch',
  /** The registry has no record of this identifier. */
  'not_found',
  /** No answer: the vendor is down, out of credit, or was never configured. */
  'unavailable',
] as const;
export type KybVerdict = (typeof KYB_VERDICTS)[number];

export type KybCheckResult = {
  check: KybVerificationCheck;
  verdict: KybVerdict;
  /** What the applicant claimed, as sent to the registry. */
  reference: string;
  /** Short reason, shown to a reviewer. Never the raw vendor payload. */
  summary: string;
  /**
   * Fields the registry returned that were compared, and whether each agreed.
   * This is what a reviewer reads when a verdict has to be argued with.
   */
  fields: { name: string; expected: string | null; actual: string | null; matched: boolean }[];
  /** Named so a disputed decision can be traced to who answered it. */
  provider: string;
  checkedAt: Date;
};

export type CacRegistrationQuery = {
  rcNumber: string;
  organizationName: string;
};

export type TaxIdentificationQuery = {
  taxIdentificationNumber: string;
  organizationName: string;
};

export type IdentityQuery = {
  identificationType: string;
  identificationNumber: string;
  contactFullName: string;
};

export type VehicleRegistrationQuery = {
  registrationNumber: string;
  chassisNumber: string | null;
  expectedOwnerName: string;
};

/**
 * A registry the platform can ask about a business, a person or a vehicle.
 *
 * One port over several vendors on purpose: no single Nigerian provider covers
 * CAC, FIRS and FRSC, so the adapter that answers a given check is a
 * deployment decision rather than something the decision logic should know.
 *
 * An implementation never throws for a failed check. A vendor being down is an
 * `unavailable` verdict, which routes the application to a human, and is not
 * the same thing as a registry saying no.
 */
export interface KybVerification {
  verifyCacRegistration(query: CacRegistrationQuery): Promise<KybCheckResult>;
  verifyTaxIdentification(
    query: TaxIdentificationQuery,
  ): Promise<KybCheckResult>;
  verifyIdentity(query: IdentityQuery): Promise<KybCheckResult>;
  verifyVehicleRegistration(
    query: VehicleRegistrationQuery,
  ): Promise<KybCheckResult>;
}

export const KYB_VERIFICATION = Symbol('KYB_VERIFICATION');
