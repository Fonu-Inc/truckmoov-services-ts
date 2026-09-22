import type {
  KybCheckResult,
  KybVerificationCheck,
} from './ports/kyb-verification.port';
import type { OnboardingApplicantType } from './onboarding-application.repository';

export const AUTOMATED_OUTCOMES = [
  'approve',
  'reject',
  'manual_review',
] as const;
export type AutomatedOutcome = (typeof AUTOMATED_OUTCOMES)[number];

export type AutomatedDecision = {
  outcome: AutomatedOutcome;
  /** Written into the decision reason, so it has to read as an answer. */
  reason: string;
};

/**
 * What each applicant type must clear before a machine may approve it.
 *
 * An owner operator supplies two documents, so their whole case rests on the
 * vehicle record and their own identity. An enterprise applicant additionally
 * has a company to check against CAC and FIRS.
 */
export const REQUIRED_CHECKS_BY_APPLICANT_TYPE: Record<
  OnboardingApplicantType,
  readonly KybVerificationCheck[]
> = {
  fleet_provider: [
    'cac_registration',
    'tax_identification',
    'vehicle_registration',
  ],
  owner_operator: ['identity', 'vehicle_registration'],
};

/**
 * Decides an application from the registry answers alone.
 *
 * Three principles, in order:
 *
 * A contradiction is a rejection. A registry saying the RC number belongs to
 * another company is a stronger signal than anything else on the application.
 *
 * Silence is never consent. A vendor that is down, out of credit or
 * unconfigured produces `unavailable`, and that goes to a human — approving on
 * an unanswered check is how an automated gate becomes a rubber stamp.
 *
 * A machine only approves what it actually checked. A missing check is not a
 * pass; it is the reason a person has to look.
 */
export function decideAutomatically(
  applicantType: OnboardingApplicantType,
  results: KybCheckResult[],
): AutomatedDecision {
  const contradicted = results.filter(
    (result) => result.verdict === 'mismatch' || result.verdict === 'not_found',
  );
  if (contradicted.length > 0) {
    return {
      outcome: 'reject',
      reason: contradicted
        .map((result) => `${checkLabel(result.check)}: ${result.summary}`)
        .join(' '),
    };
  }

  const unavailable = results.filter(
    (result) => result.verdict === 'unavailable',
  );
  if (unavailable.length > 0) {
    return {
      outcome: 'manual_review',
      reason: `Could not check ${unavailable
        .map((result) => checkLabel(result.check))
        .join(', ')}.`,
    };
  }

  const answered = new Set(results.map((result) => result.check));
  const missing = REQUIRED_CHECKS_BY_APPLICANT_TYPE[applicantType].filter(
    (check) => !answered.has(check),
  );
  if (missing.length > 0) {
    return {
      outcome: 'manual_review',
      reason: `Nothing was checked for ${missing.map(checkLabel).join(', ')}.`,
    };
  }

  return {
    outcome: 'approve',
    reason: `Every required check matched: ${[...answered]
      .map(checkLabel)
      .join(', ')}.`,
  };
}

function checkLabel(check: KybVerificationCheck): string {
  switch (check) {
    case 'cac_registration':
      return 'CAC registration';
    case 'tax_identification':
      return 'tax identification';
    case 'identity':
      return 'identity';
    case 'vehicle_registration':
      return 'vehicle registration';
  }
}
