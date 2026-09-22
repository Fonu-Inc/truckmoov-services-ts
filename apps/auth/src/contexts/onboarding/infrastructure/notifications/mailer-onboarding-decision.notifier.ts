import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import {
  APPLICATION_CHANGES_REQUESTED_SUBJECT,
  APPLICATION_CHANGES_REQUESTED_TEMPLATE,
  APPLICATION_REJECTED_SUBJECT,
  APPLICATION_REJECTED_TEMPLATE,
  APPLICATION_RESUME_SUBJECT,
  APPLICATION_RESUME_TEMPLATE,
} from '@auth/templates/onboarding-application-decision.template';
import type {
  ApplicationChangesRequestedEmail,
  ApplicationDecisionEmail,
  ApplicationResumeEmail,
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

  async sendRejected(input: ApplicationDecisionEmail): Promise<void> {
    await this.send(input.email, APPLICATION_REJECTED_SUBJECT, APPLICATION_REJECTED_TEMPLATE, {
      organizationName: input.organizationName,
      reference: input.reference,
      reason: input.reason,
      year: String(new Date().getFullYear()),
    });
  }

  async sendChangesRequested(
    input: ApplicationChangesRequestedEmail,
  ): Promise<void> {
    const resumeLink = this.buildResumeLink(
      input.applicationId,
      input.applicationToken,
    );

    await this.send(
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

  async sendResumeLink(input: ApplicationResumeEmail): Promise<void> {
    await this.send(
      input.email,
      APPLICATION_RESUME_SUBJECT,
      APPLICATION_RESUME_TEMPLATE,
      {
        organizationName: input.organizationName,
        reference: input.reference,
        resumeLink: this.buildResumeLink(
          input.applicationId,
          input.applicationToken,
        ),
        year: String(new Date().getFullYear()),
      },
    );
  }

  /**
   * The applicant has no account, so the link carries the draft token. It is as
   * sensitive as the setup link and only ever goes to the address that was
   * verified during the application.
   */
  private buildResumeLink(applicationId: string, applicationToken: string): string {
    const link = new URL('/onboarding/resume', this.config.app.tenantAppUrl);
    link.searchParams.set('application', applicationId);
    link.searchParams.set('token', applicationToken);
    return link.toString();
  }

  private async send(
    to: string,
    subject: string,
    template: string,
    variables: Record<string, string>,
  ): Promise<void> {
    try {
      await this.mailer.send({ to, subject, template, variables });
    } catch (error) {
      // A decision is already recorded by the time this runs. Failing the whole
      // request would leave the admin unable to retry without double-deciding.
      this.logger.error(
        `Onboarding decision email to ${to} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
