import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  generateApplicationToken,
  hashApplicationToken,
  isApplicationEditable,
  isDraftExpired,
} from '@auth/onboarding/domain/onboarding-application.support';
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
   * somebody else started.
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
      // Rotating the token is what makes an old link stop working: a resume
      // link that was forwarded or leaked should not survive a new request.
      const token = generateApplicationToken();
      await this.applications.save({
        ...application,
        tokenHash: hashApplicationToken(token),
        updatedAt: new Date(),
      });

      await this.notifier.sendResumeLink({
        email: application.businessEmail,
        organizationName: application.organizationName,
        reference: application.reference,
        applicationId: application.id,
        applicationToken: token,
      });
      this.logger.log(`Resume link sent for application ${application.reference}`);
    }

    return { status: true, message: GENERIC_REPLY, data: null };
  }
}
