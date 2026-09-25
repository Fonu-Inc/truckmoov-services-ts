export type StoredTwoFactorEnrolment = {
  userId: string;
  /** Encrypted at rest. A leaked row must not yield working codes. */
  secretCiphertext: string;
  /** Null until the first correct code proves the app was set up. */
  confirmedAt: Date | null;
  /** Hashed, single-use. Used when the authenticator is lost. */
  recoveryCodeHashes: string[];
  /** The time step of the last code accepted at sign-in, so it is not accepted twice. */
  lastUsedStep: number | null;
  /** Moves on whenever the enrolment is used or replaced; a challenge names the version it expects. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface TwoFactorRepository {
  findByUserId(userId: string): Promise<StoredTwoFactorEnrolment | null>;
  save(enrolment: StoredTwoFactorEnrolment): Promise<void>;
  /** Writes only if the stored version is still `expectedVersion`. False when another use got there first. */
  saveIfVersion(enrolment: StoredTwoFactorEnrolment, expectedVersion: number): Promise<boolean>;
  deleteByUserId(userId: string): Promise<void>;
}

export const TWO_FACTOR_REPOSITORY = Symbol('TWO_FACTOR_REPOSITORY');

/** Whether this enrolment can satisfy a login. */
export function isTwoFactorActive(
  enrolment: StoredTwoFactorEnrolment | null,
): enrolment is StoredTwoFactorEnrolment {
  return enrolment !== null && enrolment.confirmedAt !== null;
}
