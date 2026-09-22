export const ONBOARDING_DECISION_NOTIFIER = Symbol(
  'ONBOARDING_DECISION_NOTIFIER',
);

export type ApplicationDecisionEmail = {
  email: string;
  organizationName: string;
  reference: string;
  reason: string;
};

export type ApplicationChangesRequestedEmail = ApplicationDecisionEmail & {
  applicationId: string;
  applicationToken: string;
};

export interface OnboardingDecisionNotifier {
  sendRejected(input: ApplicationDecisionEmail): Promise<void>;
  sendChangesRequested(input: ApplicationChangesRequestedEmail): Promise<void>;
}
