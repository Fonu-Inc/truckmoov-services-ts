import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  generateApplicationToken,
  hashApplicationToken,
} from '@auth/onboarding/domain/onboarding-application.support';
import {
  ONBOARDING_DECISION_NOTIFIER,
  type ApplicationResumeEmail,
  type OnboardingDecisionNotifier,
} from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';

@Injectable()
export class ApplicationPaymentNoticeService {
  private readonly logger = new Logger(ApplicationPaymentNoticeService.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
  ) {}

  /** Tells the applicant payment is open. Sent once per application, whoever moved it. */
  async paymentOpened(application: StoredOnboardingApplication, now: Date = new Date()): Promise<void> {
    await this.attempt(application.id, async () => {
      if (!(await this.applications.claimPaymentNotice(application.id, now))) return;
      await this.deliver(application.id, (email) => this.notifier.sendPaymentOpen(email));
    });
  }

  async paymentRefunded(applicationId: string): Promise<void> {
    await this.attempt(applicationId, () =>
      this.deliver(applicationId, (email) => this.notifier.sendPaymentRefunded(email)),
    );
  }

  private async attempt(applicationId: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.logger.error(
        `onboarding_payment_notice_failed:${applicationId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /**
   * The applicant's token is stored only as a hash, so a fresh one is minted for
   * the link. The previous link stops working, as with every other resume mail.
   */
  private async deliver(
    applicationId: string,
    send: (email: ApplicationResumeEmail) => Promise<void>,
  ): Promise<void> {
    const current = await this.applications.findById(applicationId);
    if (!current) return;
    const token = generateApplicationToken();
    await this.applications.save({
      ...current,
      tokenHash: hashApplicationToken(token),
      updatedAt: new Date(),
    });
    await send({
      email: current.billingEmail && current.billingEmailVerifiedAt ? current.billingEmail : current.businessEmail,
      organizationName: current.organizationName,
      reference: current.reference,
      applicationId: current.id,
      applicationToken: token,
    });
  }
}
