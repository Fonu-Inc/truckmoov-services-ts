export const ONBOARDING_VERIFICATION_NOTIFIER = Symbol(
  'ONBOARDING_VERIFICATION_NOTIFIER',
);

export class VerificationDispatchError extends Error {
  constructor(channel: string) {
    super(`Could not send the ${channel} verification code`);
    this.name = 'VerificationDispatchError';
  }
}

export type VerificationCodeMessage = {
  applicationId: string;
  destination: string;
  code: string;
  organizationName: string;
};

export interface OnboardingVerificationNotifier {
  sendEmailCode(input: VerificationCodeMessage): Promise<void>;
  sendSmsCode(input: VerificationCodeMessage): Promise<void>;
}
