import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { ApplicationNotFoundError } from '@auth/onboarding/domain/onboarding-application.support';
import {
  ONBOARDING_DECISION_NOTIFIER,
  type OnboardingDecisionNotifier,
} from '@auth/onboarding/domain/ports/onboarding-decision-notifier.port';
import { PAYMENT_NOTICE_LEASE_MS } from '../services/application-payment-notice.service';
import { sendChangesRequestedLink } from './decide-onboarding-application.use-cases';

export class ChangesLinkNotResendableError extends Error {
  constructor() {
    super('Only an application waiting for the applicant to make changes has a link to resend');
    this.name = 'ChangesLinkNotResendableError';
  }
}

export class ChangesLinkResentTooSoonError extends Error {
  constructor() {
    super('A link was sent a moment ago. Wait two minutes before sending another.');
    this.name = 'ChangesLinkResentTooSoonError';
  }
}

@Injectable()
export class ResendChangesRequestedLinkUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_DECISION_NOTIFIER)
    private readonly notifier: OnboardingDecisionNotifier,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /** Issues a new link, which replaces the old one only once the mail was accepted. */
  async execute(input: { accessToken: string; applicationId: string }) {
    const actor = await ensureSystemActor(input.accessToken, this.tokenService, this.users, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
    });
    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    if (application.status !== 'changes_requested' || !application.decisionReason) {
      throw new ChangesLinkNotResendableError();
    }

    const now = new Date();
    const leaseEnds = new Date(now.getTime() - PAYMENT_NOTICE_LEASE_MS);
    if (!(await this.applications.claimPaymentNoticeAttempt(application.id, now, leaseEnds))) {
      throw new ChangesLinkResentTooSoonError();
    }

    const delivery = await sendChangesRequestedLink(
      this.applications,
      this.notifier,
      application,
      application.decisionReason,
    );
    return {
      status: true,
      message: delivery.delivered ? 'Link sent' : 'The link could not be delivered',
      data: {
        applicationId: application.id,
        reference: application.reference,
        delivered: delivery.delivered,
        resentBy: actor.id,
        resentAt: now.toISOString(),
      },
    };
  }
}
