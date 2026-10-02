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
import { ApplicationPaymentNoticeService } from '../services/application-payment-notice.service';

export class PaymentLinkNotResendableError extends Error {
  constructor() {
    super('Only an approved application waiting for payment has a payment link');
    this.name = 'PaymentLinkNotResendableError';
  }
}

export class PaymentLinkResentTooSoonError extends Error {
  constructor() {
    super('A payment link was sent a moment ago. Wait two minutes before sending another.');
    this.name = 'PaymentLinkResentTooSoonError';
  }
}

@Injectable()
export class ResendPaymentLinkUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ApplicationPaymentNoticeService)
    private readonly notices: ApplicationPaymentNoticeService,
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
    if (application.status !== 'approved' || application.stage !== 'payment') {
      throw new PaymentLinkNotResendableError();
    }

    const now = new Date();
    const outcome = await this.notices.resendPaymentLink(application.id, now);
    if (outcome === 'throttled') throw new PaymentLinkResentTooSoonError();
    if (outcome === 'skipped') throw new ApplicationNotFoundError();

    const delivered = outcome === 'sent';
    return {
      status: true,
      message: delivered ? 'Payment link sent' : 'The payment link could not be delivered',
      data: {
        applicationId: application.id,
        reference: application.reference,
        delivered,
        resentBy: actor.id,
        resentAt: now.toISOString(),
      },
    };
  }
}
