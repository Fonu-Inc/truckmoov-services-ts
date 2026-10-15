import type {
  OnboardingApplicationRepository,
  StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';

/**
 * Marks the application as worked on.
 *
 * The draft lifetime runs from `updatedAt`, and adding a vehicle or uploading a
 * document does not otherwise write to the application row. Without this, an
 * applicant could spend a month filling the form and still find the draft
 * expired because the last write was to a child table.
 */
export async function touchApplication(
  applications: OnboardingApplicationRepository,
  application: StoredOnboardingApplication,
): Promise<void> {
  const current = await applications.findById(application.id);
  if (current) await applications.save({ ...current, updatedAt: new Date() });
}
