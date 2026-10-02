import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import {
  APPLICATION_CHANGES_REQUESTED_SUBJECT,
  APPLICATION_CHANGES_REQUESTED_TEMPLATE,
  APPLICATION_PAYMENT_OPEN_SUBJECT,
  APPLICATION_PAYMENT_OPEN_TEMPLATE,
  APPLICATION_PAYMENT_REFUNDED_SUBJECT,
  APPLICATION_PAYMENT_REFUNDED_TEMPLATE,
  APPLICATION_REJECTED_SUBJECT,
  APPLICATION_REJECTED_TEMPLATE,
  APPLICATION_RESUME_SUBJECT,
  APPLICATION_RESUME_TEMPLATE,
} from '@auth/templates/onboarding-application-decision.template';
import type {
  ApplicationChangesRequestedEmail,
  ApplicationDecisionEmail,
  ApplicationResumeEmail,
  MailDelivery,
  OnboardingDecisionNotifier,
} from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';

@Injectable()
export class MailerOnboardingDecisionNotifier
  implements OnboardingDecisionNotifier
{
  private readonly logger = new Logger(MailerOnboardingDecisionNotifier.name);

  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async sendRejected(input: ApplicationDecisionEmail): Promise<MailDelivery> {
    return this.send(input.email, APPLICATION_REJECTED_SUBJECT, APPLICATION_REJECTED_TEMPLATE, {
      organizationName: input.organizationName,
      reference: input.reference,
      reason: input.reason,
      applyLink: new URL('/apply', this.config.app.tenantAppUrl).toString(),
      year: String(new Date().getFullYear()),
    });
  }

  async sendChangesRequested(
    input: ApplicationChangesRequestedEmail,
  ): Promise<MailDelivery> {
    const resumeLink = this.buildResumeLink(
      input.applicationId,
      input.applicationToken,
    );

    return this.send(
      input.email,
      APPLICATION_CHANGES_REQUESTED_SUBJECT,
      APPLICATION_CHANGES_REQUESTED_TEMPLATE,
      {
        organizationName: input.organizationName,
        reference: input.reference,
        reason: input.reason,
        resumeLink,
        year: String(new Date().getFullYear()),
      },
    );
  }

  sendResumeLink(input: ApplicationResumeEmail): Promise<MailDelivery> {
    return this.sendLink(input, APPLICATION_RESUME_SUBJECT, APPLICATION_RESUME_TEMPLATE);
  }

  sendPaymentOpen(input: ApplicationResumeEmail): Promise<MailDelivery> {
    return this.sendLink(input, APPLICATION_PAYMENT_OPEN_SUBJECT, APPLICATION_PAYMENT_OPEN_TEMPLATE);
  }

  sendPaymentRefunded(input: ApplicationResumeEmail): Promise<MailDelivery> {
    return this.sendLink(input, APPLICATION_PAYMENT_REFUNDED_SUBJECT, APPLICATION_PAYMENT_REFUNDED_TEMPLATE);
  }

  private sendLink(input: ApplicationResumeEmail, subject: string, template: string): Promise<MailDelivery> {
    return this.send(input.email, subject, template, {
      organizationName: input.organizationName,
      reference: input.reference,
      resumeLink: this.buildResumeLink(input.applicationId, input.applicationToken),
      year: String(new Date().getFullYear()),
    });
  }

  /**
   * The applicant has no account, so the link carries the draft token. It is as
   * sensitive as the setup link and only ever goes to the address that was
   * verified during the application.
   */
  private buildResumeLink(applicationId: string, applicationToken: string): string {
    const link = new URL('/apply', this.config.app.tenantAppUrl);
    link.searchParams.set('token', applicationToken);
    link.searchParams.set('applicationId', applicationId);
    return link.toString();
  }

  private async send(
    to: string,
    subject: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<MailDelivery> {
    try {
      await this.mailer.send({ to, subject, template, variables });
      return { delivered: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Onboarding decision email to ${to} failed: ${reason}`);
      return { delivered: false, error: reason };
    }
  }
}
