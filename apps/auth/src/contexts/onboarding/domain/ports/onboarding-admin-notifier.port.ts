export const ONBOARDING_ADMIN_NOTIFIER = Symbol('ONBOARDING_ADMIN_NOTIFIER');

export type NewApplicationAlert = {
  organizationName: string;
  reference: string;
  applicantType: string;
  vehicleCount: number;
  deviceCount: number;
  /** What the registry checks concluded, so the queue is triaged from the email. */
  automatedOutcome: string;
};

/**
 * Tells the platform team a customer has applied.
 *
 * The review queue is pull-only without this: an application that the checks
 * could not settle sits there until somebody happens to look.
 */
export interface OnboardingAdminNotifier {
  sendNewApplicationAlert(alert: NewApplicationAlert): Promise<void>;
}
