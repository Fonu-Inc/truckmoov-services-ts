import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@shared/mailer';
import {
  ONBOARDING_VERIFICATION_CODE_SUBJECT,
  ONBOARDING_VERIFICATION_CODE_TEMPLATE,
} from '@auth/templates/onboarding-verification-code.template';
import { VERIFICATION_CODE_TTL_MS } from '@auth/onboarding/domain/onboarding-application.support';
import { UnifiedSmsService } from '../../../otp/unified-sms.service';
import {
  VerificationDispatchError,
  type OnboardingVerificationNotifier,
  type VerificationCodeMessage,
} from '@auth/onboarding/domain/ports/onboarding-verification-notifier.port';

@Injectable()
export class MailerOnboardingVerificationNotifier
  implements OnboardingVerificationNotifier
{
  private readonly logger = new Logger(
    MailerOnboardingVerificationNotifier.name,
  );

  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(UnifiedSmsService) private readonly sms: UnifiedSmsService,
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
    const expiryMinutes = VERIFICATION_CODE_TTL_MS / 60_000;

    // The applicant has no tenant and no wallet. The unified SMS service is
    // platform-owned, so this send is not attributed to the organisation
    // applying.
    try {
      await this.sms.send({
        channel: 'sms',
        to: input.destination,
        otp: input.code,
        dedupKey: input.applicationId,
        message: `{{otp}} is your TruckMoov verification code. It expires in ${expiryMinutes} minutes.`,
      });
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
