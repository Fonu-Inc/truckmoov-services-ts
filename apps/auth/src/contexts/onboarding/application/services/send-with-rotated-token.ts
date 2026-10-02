import type { OnboardingApplicationRepository } from '@auth/onboarding/domain/onboarding-application.repository';
import {
  generateApplicationToken,
  hashApplicationToken,
} from '@auth/onboarding/domain/onboarding-application.support';
import type { MailDelivery } from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';

/** Mails a link carrying a new token and retires the old one only once the mail was accepted. */
export async function sendWithRotatedToken(
  applications: OnboardingApplicationRepository,
  applicationId: string,
  send: (token: string) => Promise<MailDelivery>,
): Promise<MailDelivery> {
  const token = generateApplicationToken();
  const delivery = await send(token).catch(
    (error: unknown): MailDelivery => ({
      delivered: false,
      error: error instanceof Error ? error.message : 'unknown',
    }),
  );
  if (delivery.delivered) {
    await applications.replaceTokenHash(applicationId, hashApplicationToken(token));
  }
  return delivery;
}
