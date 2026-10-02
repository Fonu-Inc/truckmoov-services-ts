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

export type ApplicationResumeEmail = {
  email: string;
  organizationName: string;
  reference: string;
  applicationId: string;
  applicationToken: string;
};

/** Whether the mail transport accepted the message. A failure carries why. */
export type MailDelivery = { delivered: true } | { delivered: false; error: string };

export interface OnboardingDecisionNotifier {
  sendRejected(input: ApplicationDecisionEmail): Promise<MailDelivery>;
  sendChangesRequested(input: ApplicationChangesRequestedEmail): Promise<MailDelivery>;
  sendResumeLink(input: ApplicationResumeEmail): Promise<MailDelivery>;
  sendPaymentOpen(input: ApplicationResumeEmail): Promise<MailDelivery>;
  sendPaymentRefunded(input: ApplicationResumeEmail): Promise<MailDelivery>;
}
