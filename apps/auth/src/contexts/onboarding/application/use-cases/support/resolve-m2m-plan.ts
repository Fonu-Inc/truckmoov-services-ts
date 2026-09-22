import type { M2mLicensePlanRepository } from '@auth/onboarding/domain/m2m-license-plan.repository';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';

/**
 * The plan code as it will be stored, or null when none was chosen.
 *
 * A code is checked against the live catalogue rather than an enum so a plan
 * can be retired without a deploy, and so an application cannot carry a code
 * that nothing prices at payment.
 */
export async function resolveM2mPlanCode(
  plans: M2mLicensePlanRepository,
  value: unknown,
): Promise<string | null> {
  const code = String(value ?? '').trim();
  if (code.length === 0) return null;

  const plan = await plans.findByCode(code);
  if (!plan || !plan.isActive) {
    throw new OnboardingValidationError(
      'm2mPlanCode',
      'That M2M licence plan is not available',
    );
  }
  return plan.code;
}
