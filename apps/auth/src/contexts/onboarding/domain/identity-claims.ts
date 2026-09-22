import type {
  IdentityClaimInput,
  StoredIdentityClaim,
} from './identity-claim.repository';
import type {
  OnboardingApplicationStatus,
  StoredOnboardingApplication,
  StoredOnboardingApplicationDocument,
} from './onboarding-application.repository';

/**
 * A rejected application stops blocking anything.
 *
 * Every other state is a live claim on the identity: a draft somebody is still
 * filling in, one in review, and an approved one that became a tenant.
 */
const BLOCKING_STATUSES: readonly OnboardingApplicationStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
];

export function blocksOtherApplications(
  status: OnboardingApplicationStatus,
): boolean {
  return BLOCKING_STATUSES.includes(status);
}

/**
 * Everything the application currently claims identifies it.
 *
 * Recomputed from the application and its documents rather than accumulated,
 * so an edit that drops a value drops the claim with it.
 */
export function identityClaimsOf(
  application: StoredOnboardingApplication,
  documents: StoredOnboardingApplicationDocument[],
): IdentityClaimInput[] {
  const claims: IdentityClaimInput[] = [];

  if (application.rcNumber) {
    claims.push({ claimType: 'rc_number', claimValue: application.rcNumber });
  }
  if (application.taxIdentificationNumber) {
    claims.push({
      claimType: 'tax_identification_number',
      claimValue: application.taxIdentificationNumber,
    });
  }
  if (application.identificationNumber) {
    claims.push({
      claimType: 'identification_number',
      claimValue: application.identificationNumber,
    });
  }

  for (const document of documents) {
    if (!document.fileHash) continue;
    claims.push({ claimType: 'document_hash', claimValue: document.fileHash });
  }

  return dedupe(claims);
}

export function describeConflict(conflicts: StoredIdentityClaim[]): string {
  const types = [...new Set(conflicts.map((claim) => claim.claimType))];
  return `These details are already on another application: ${types
    .map(claimTypeLabel)
    .join(', ')}.`;
}

function claimTypeLabel(type: StoredIdentityClaim['claimType']): string {
  switch (type) {
    case 'rc_number':
      return 'CAC registration number';
    case 'tax_identification_number':
      return 'tax identification number';
    case 'identification_number':
      return 'identification number';
    case 'document_hash':
      return 'an uploaded document';
  }
}

function dedupe(claims: IdentityClaimInput[]): IdentityClaimInput[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.claimType}:${claim.claimValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
