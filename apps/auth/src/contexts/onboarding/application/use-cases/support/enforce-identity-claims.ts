import type {
  IdentityClaimRepository,
  StoredIdentityClaim,
} from '@auth/onboarding/domain/identity-claim.repository';
import {
  blocksOtherApplications,
  describeConflict,
  identityClaimsOf,
} from '@auth/onboarding/domain/identity-claims';
import type {
  OnboardingApplicationRepository,
  StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';

export class DuplicateIdentityError extends Error {
  constructor(
    message: string,
    readonly claimTypes: string[],
  ) {
    super(message);
    this.name = 'DuplicateIdentityError';
  }
}

/**
 * Refuses an application that reuses another one's identity, then records what
 * this one claims.
 *
 * A second email address is free to create; a CAC certificate, a TIN or a
 * scanned ID is not. Matching on those is what stops one business opening
 * several accounts under different addresses.
 *
 * Checked on every write rather than at submission alone: a conflict
 * introduced on the first screen should be reported there, not after the
 * applicant has uploaded eight documents.
 */
export async function enforceIdentityClaims(
  identityClaims: IdentityClaimRepository,
  applications: OnboardingApplicationRepository,
  application: StoredOnboardingApplication,
): Promise<void> {
  const documents = await applications.findDocumentsByApplicationId(
    application.id,
  );
  const claims = identityClaimsOf(application, documents);
  if (claims.length === 0) {
    await identityClaims.replaceForApplication(application.id, claims);
    return;
  }

  const conflicts = await identityClaims.findConflicts(claims, application.id);
  const blocking = await blockingConflicts(applications, conflicts);
  if (blocking.length > 0) {
    throw new DuplicateIdentityError(describeConflict(blocking), [
      ...new Set(blocking.map((claim) => claim.claimType)),
    ]);
  }

  await identityClaims.replaceForApplication(application.id, claims);
}

/**
 * A conflict only counts while the other application is still alive. A
 * rejected one has released its claim, and its rows are kept only so the
 * decision can be explained.
 */
async function blockingConflicts(
  applications: OnboardingApplicationRepository,
  conflicts: StoredIdentityClaim[],
): Promise<StoredIdentityClaim[]> {
  const blocking: StoredIdentityClaim[] = [];
  const checked = new Map<string, boolean>();

  for (const conflict of conflicts) {
    let blocks = checked.get(conflict.applicationId);
    if (blocks === undefined) {
      const other = await applications.findById(conflict.applicationId);
      blocks = other !== null && blocksOtherApplications(other.status);
      checked.set(conflict.applicationId, blocks);
    }
    if (blocks) blocking.push(conflict);
  }

  return blocking;
}
