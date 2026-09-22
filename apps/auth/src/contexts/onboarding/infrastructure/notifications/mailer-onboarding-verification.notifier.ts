import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import {
  ONBOARDING_VERIFICATION_CODE_SUBJECT,
  ONBOARDING_VERIFICATION_CODE_TEMPLATE,
} from '@auth/templates/onboarding-verification-code.template';
import { VERIFICATION_CODE_TTL_MS } from '@auth/onboarding/domain/onboarding-application.support';
import {
  VerificationDispatchError,
  type OnboardingVerificationNotifier,
  type VerificationCodeMessage,
} from '@auth/onboarding/domain/ports/onboarding-verification-notifier.port';

// The applicant has no tenant and no wallet, so onboarding messages are sent
// as the platform and charged to it, never to the organisation applying.
const PLATFORM_TENANT_ID = 'system';

@Injectable()
export class MailerOnboardingVerificationNotifier
  implements OnboardingVerificationNotifier
{
  private readonly logger = new Logger(
    MailerOnboardingVerificationNotifier.name,
  );

  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async sendEmailCode(input: VerificationCodeMessage): Promise<void> {
    try {
      await this.mailer.send({
        to: input.destination,
        subject: ONBOARDING_VERIFICATION_CODE_SUBJECT,
        template: ONBOARDING_VERIFICATION_CODE_TEMPLATE,
        variables: {
          code: input.code,
          organizationName: input.organizationName,
          expiryMinutes: String(VERIFICATION_CODE_TTL_MS / 60_000),
          year: String(new Date().getFullYear()),
        },
      });
    } catch (error) {
      this.logger.error(
        `Onboarding email code dispatch failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new VerificationDispatchError('email');
    }
  }

  async sendSmsCode(input: VerificationCodeMessage): Promise<void> {
    const url = `${this.config.auth.notificationServiceUrl.replace(/\/+$/, '')}/notify/messages/send`;
    const expiryMinutes = VERIFICATION_CODE_TTL_MS / 60_000;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: PLATFORM_TENANT_ID,
          channel: 'sms',
          recipient: input.destination,
          content: `${input.code} is your TruckMoov verification code. It expires in ${expiryMinutes} minutes.`,
        }),
      });
      if (!response.ok) {
        throw new Error(`notification service returned ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Onboarding SMS code dispatch failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new VerificationDispatchError('SMS');
    }
  }
}
