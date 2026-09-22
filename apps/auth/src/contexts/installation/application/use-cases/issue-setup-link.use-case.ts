import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_NOTIFIER,
  INVITE_REPOSITORY,
} from '@auth/session';
import type { AuthNotifier } from '@auth/session/domain/ports/auth-notifier.port';
import type { InviteRepository } from '@auth/session/domain/ports/invite-repository.port';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { ORG_TYPE_TO_BOOTSTRAP_ROLE } from '../../../../tenant-onboarding.repository';

/** Matches the existing tenant bootstrap invite window. */
export const SETUP_LINK_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class IssueSetupLinkUseCase {
  private readonly logger = new Logger(IssueSetupLinkUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INVITE_REPOSITORY) private readonly invites: InviteRepository,
    @Inject(AUTH_NOTIFIER) private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  /**
   * Creates the account setup link and emails it.
   *
   * Sent when an installation is booked rather than at approval, because that
   * is the first moment there is anything for the customer to log in and see.
   *
   * A failed send never fails the caller: the booking is made and recorded, and
   * the link can be resent. Recording the failure is what puts it on the admin
   * screen instead of losing it in a log line.
   */
  async execute(
    application: StoredOnboardingApplication,
  ): Promise<{ delivered: boolean }> {
    if (!application.tenantId) return { delivered: false };

    const now = new Date();
    const token = this.idGenerator.generate();
    const role = ORG_TYPE_TO_BOOTSTRAP_ROLE[application.applicantType];

    await this.invites.save({
      id: this.idGenerator.generate(),
      email: application.businessEmail,
      role,
      tenantId: application.tenantId,
      token,
      invitedBy: 'system',
      status: 'pending',
      expiresAt: new Date(now.getTime() + SETUP_LINK_TTL_MS),
      createdAt: now,
    });

    try {
      await this.notifier.sendTenantInviteEmail({
        email: application.businessEmail,
        role,
        inviteToken: token,
      });
    } catch (error) {
      await this.record(application, now, 'failed', errorMessage(error));
      this.logger.error(
        `setup_link_failed:${application.reference}:${errorMessage(error)}`,
      );
      return { delivered: false };
    }

    await this.record(application, now, 'sent', null);
    return { delivered: true };
  }

  private async record(
    application: StoredOnboardingApplication,
    at: Date,
    status: 'sent' | 'failed',
    error: string | null,
  ): Promise<void> {
    const current = await this.applications.findById(application.id);
    if (!current) return;

    await this.applications.save({
      ...current,
      setupLinkStatus: status,
      setupLinkSentAt: at,
      setupLinkError: error,
      setupLinkAttempts: current.setupLinkAttempts + 1,
      updatedAt: at,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}
