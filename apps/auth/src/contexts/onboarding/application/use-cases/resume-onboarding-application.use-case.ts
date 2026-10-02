import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  isApplicationEditable,
  isDraftExpired,
} from '@auth/onboarding/domain/onboarding-application.support';
import { sendWithRotatedToken } from '../services/send-with-rotated-token';
import { validateBusinessEmail } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  ONBOARDING_DECISION_NOTIFIER,
  type OnboardingDecisionNotifier,
} from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';

const GENERIC_REPLY =
  'If an application is open for that address, we have emailed a link to continue it.';

@Injectable()
export class ResumeOnboardingApplicationUseCase {
  private readonly logger = new Logger(ResumeOnboardingApplicationUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
  ) {}

  /**
   * Emails a fresh link into an open application.
   *
   * The answer is the same whether or not an application exists, because a
   * different answer would turn this into a way to ask which businesses have
   * applied. The link is only sent to an address that was already verified on
   * the application, so an unverified address cannot be used to pull a draft
   * somebody else started. A failed send throws, so the applicant can retry;
   * the previous link stays valid until a new one has been mailed.
   */
  async execute(businessEmail: unknown) {
    const email = validateBusinessEmail(businessEmail);
    const application =
      await this.applications.findLiveByBusinessEmail(email);

    if (
      application &&
      isApplicationEditable(application) &&
      !isDraftExpired(application) &&
      application.emailVerifiedAt !== null
    ) {
      const delivery = await sendWithRotatedToken(this.applications, application.id, (token) =>
        this.notifier.sendResumeLink({
          email: application.businessEmail,
          organizationName: application.organizationName,
          reference: application.reference,
          applicationId: application.id,
          applicationToken: token,
        }),
      );
      if (!delivery.delivered) {
        this.logger.error(`onboarding_resume_mail_failed:${application.id}:${delivery.error}`);
      }
      this.logger.log(`Resume link sent for application ${application.reference}`);
    }

    return { status: true, message: GENERIC_REPLY, data: null };
  }
}
