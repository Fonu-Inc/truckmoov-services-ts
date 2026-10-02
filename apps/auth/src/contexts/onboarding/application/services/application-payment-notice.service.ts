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
import { PlatformAlertPublisher } from '../../../../platform-alert.publisher';

export const PAYMENT_NOTICE_LEASE_MS = 2 * 60 * 1000;
export const PAYMENT_NOTICE_MAX_ATTEMPTS = 6;

export type PaymentNoticeOutcome = 'sent' | 'failed' | 'throttled' | 'skipped';

@Injectable()
export class ApplicationPaymentNoticeService {
  private readonly logger = new Logger(ApplicationPaymentNoticeService.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
    @Inject(PlatformAlertPublisher)
    private readonly alerts: PlatformAlertPublisher,
  ) {}

  /** Tells the applicant payment is open. Counts as sent only once the mail was accepted, so a failure is retried. */
  paymentOpened(application: StoredOnboardingApplication, now: Date = new Date()): Promise<PaymentNoticeOutcome> {
    return this.sendPaymentOpen(application.id, now, false);
  }

  /** Retry of a notice that has not gone out yet. */
  retryPaymentOpen(applicationId: string, now: Date = new Date()): Promise<PaymentNoticeOutcome> {
    return this.sendPaymentOpen(applicationId, now, false);
  }

  /** Staff resend: goes out even when an earlier notice did, at most once per lease. */
  resendPaymentLink(applicationId: string, now: Date = new Date()): Promise<PaymentNoticeOutcome> {
    return this.sendPaymentOpen(applicationId, now, true);
  }

  async paymentRefunded(applicationId: string): Promise<boolean> {
    try {
      const current = await this.applications.findById(applicationId);
      if (!current) return false;
      const token = generateApplicationToken();
      const delivery = await this.notifier.sendPaymentRefunded(this.emailFor(current, token));
      if (!delivery.delivered) {
        this.logger.error(`onboarding_refund_notice_failed:${applicationId}:${delivery.error}`);
        return false;
      }
      await this.applications.replaceTokenHash(applicationId, hashApplicationToken(token));
      return true;
    } catch (error) {
      this.logger.error(`onboarding_refund_notice_failed:${applicationId}:${errorMessage(error)}`);
      return false;
    }
  }

  private async sendPaymentOpen(applicationId: string, now: Date, resend: boolean): Promise<PaymentNoticeOutcome> {
    try {
      return await this.attemptPaymentOpen(applicationId, now, resend);
    } catch (error) {
      this.logger.error(`onboarding_payment_notice_failed:${applicationId}:${errorMessage(error)}`);
      return 'failed';
    }
  }

  /**
   * The applicant's token is stored only as a hash, so a fresh one is minted for
   * the link. It replaces the old one only after the mail was accepted: until
   * then the old link keeps working and the notice stays owed.
   */
  private async attemptPaymentOpen(applicationId: string, now: Date, resend: boolean): Promise<PaymentNoticeOutcome> {
    const current = await this.applications.findById(applicationId);
    if (!current || (!resend && current.paymentNotifiedAt)) return 'skipped';
    const leaseEnds = new Date(now.getTime() - PAYMENT_NOTICE_LEASE_MS);
    if (!(await this.applications.claimPaymentNoticeAttempt(applicationId, now, leaseEnds))) return 'throttled';

    const token = generateApplicationToken();
    const delivery = await this.notifier.sendPaymentOpen(this.emailFor(current, token));
    if (delivery.delivered) {
      await this.applications.completePaymentNotice(applicationId, hashApplicationToken(token), now);
      return 'sent';
    }
    await this.noteFailure(current, delivery.error);
    return 'failed';
  }

  private async noteFailure(application: StoredOnboardingApplication, error: string): Promise<void> {
    const attempts = await this.applications.recordPaymentNoticeFailure(application.id, error);
    this.logger.error(`onboarding_payment_notice_failed:${application.id}:attempt=${attempts}:${error}`);
    if (attempts !== PAYMENT_NOTICE_MAX_ATTEMPTS) return;
    await this.alerts.raise({
      alertType: 'installation_issues',
      severity: 'medium',
      subject: `Payment email undelivered (${application.reference})`,
      body: `The payment-open email for ${application.organizationName} failed ${attempts} times and will not be retried. Use Resend payment link on the application page.`,
      context: { applicationId: application.id, reference: application.reference, error, attempts },
    });
  }

  private emailFor(application: StoredOnboardingApplication, token: string): ApplicationResumeEmail {
    const useBilling = application.billingEmail && application.billingEmailVerifiedAt;
    return {
      email: useBilling ? application.billingEmail! : application.businessEmail,
      organizationName: application.organizationName,
      reference: application.reference,
      applicationId: application.id,
      applicationToken: token,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}
