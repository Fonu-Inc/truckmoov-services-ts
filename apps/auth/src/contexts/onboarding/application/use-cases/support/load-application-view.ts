import type {
  OnboardingApplicationRepository,
  StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { toApplicationView } from '@auth/onboarding/domain/onboarding-application.support';

/**
 * The application as the applicant sees it, with everything hanging off it.
 *
 * Every screen in the flow reads the same shape, so the reads live here rather
 * than in each use case, where one of them would sooner or later forget a part
 * and return a view that silently disagrees with the others.
 */
export async function loadApplicationView(
  applications: OnboardingApplicationRepository,
  application: StoredOnboardingApplication,
) {
  const [documents, vehicles, deviceRequests] = await Promise.all([
    applications.findDocumentsByApplicationId(application.id),
    applications.findVehiclesByApplicationId(application.id),
    applications.findDeviceRequestsByApplicationId(application.id),
  ]);

  return toApplicationView(application, documents, vehicles, deviceRequests);
}
