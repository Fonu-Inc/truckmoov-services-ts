import { SYSTEM_TENANT_ID } from '@shared/identity';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@shared/mailer';
import {
  NEW_APPLICATION_ALERT_SUBJECT,
  NEW_APPLICATION_ALERT_TEMPLATE,
} from '@auth/templates/onboarding-application-decision.template';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@auth/session/domain/ports/user-repository.port';
import type {
  NewApplicationAlert,
  OnboardingAdminNotifier,
} from '@auth/onboarding/domain/ports/onboarding-admin-notifier.port';

const PLATFORM_TENANT_ID = SYSTEM_TENANT_ID;

@Injectable()
export class MailerOnboardingAdminNotifier implements OnboardingAdminNotifier {
  private readonly logger = new Logger(MailerOnboardingAdminNotifier.name);

  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async sendNewApplicationAlert(alert: NewApplicationAlert): Promise<void> {
    const admins = await this.users.findAllByTenant(PLATFORM_TENANT_ID);
    const recipients = admins
      .filter((admin) => admin.accountStatus !== 'disabled')
      .map((admin) => admin.email);

    if (recipients.length === 0) {
      this.logger.warn(
        `new_application_alert_no_recipients:${alert.reference}`,
      );
      return;
    }

    for (const to of recipients) {
      try {
        await this.mailer.send({
          to,
          subject: NEW_APPLICATION_ALERT_SUBJECT,
          template: NEW_APPLICATION_ALERT_TEMPLATE,
          variables: {
            organizationName: alert.organizationName,
            reference: alert.reference,
            applicantType: alert.applicantType.replace(/_/g, ' '),
            vehicleCount: String(alert.vehicleCount),
            deviceCount: String(alert.deviceCount),
            automatedOutcome: alert.automatedOutcome.replace(/_/g, ' '),
            year: String(new Date().getFullYear()),
          },
        });
      } catch (error) {
        // The application is already submitted and queued. A failed alert must
        // not undo that; the queue still holds the work.
        this.logger.error(
          `new_application_alert_failed:${alert.reference}:${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }
}
