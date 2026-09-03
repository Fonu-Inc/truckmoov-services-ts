import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import {
  APPLICATION_CHANGES_REQUESTED_SUBJECT,
  APPLICATION_CHANGES_REQUESTED_TEMPLATE,
  APPLICATION_REJECTED_SUBJECT,
  APPLICATION_REJECTED_TEMPLATE,
} from './templates/onboarding-application-decision.template';

export type ApplicationDecisionEmail = {
  email: string;
  organizationName: string;
  reference: string;
  reason: string;
};

export type ApplicationChangesRequestedEmail = ApplicationDecisionEmail & {
  applicationId: string;
  applicationToken: string;
};

@Injectable()
export class OnboardingDecisionNotifier {
  private readonly logger = new Logger(OnboardingDecisionNotifier.name);

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
    // The applicant has no account, so the resume link carries the draft token.
    // It is as sensitive as the setup link and is only ever sent to the address
    // that was verified during the application.
    const resumeLink = new URL(
      '/onboarding/resume',
      this.config.app.tenantAppUrl,
    );
    resumeLink.searchParams.set('application', input.applicationId);
    resumeLink.searchParams.set('token', input.applicationToken);

    await this.send(
      input.email,
      APPLICATION_CHANGES_REQUESTED_SUBJECT,
      APPLICATION_CHANGES_REQUESTED_TEMPLATE,
      {
        organizationName: input.organizationName,
        reference: input.reference,
        reason: input.reason,
        resumeLink: resumeLink.toString(),
        year: String(new Date().getFullYear()),
      },
    );
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
