import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import {
  MISMATCH_REVIEW_OUTCOMES,
  ONBOARDING_PAYMENT_REPOSITORY,
  type MismatchReviewOutcome,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { ApplicationNotFoundError } from '@auth/onboarding/domain/onboarding-application.support';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';

const NOTE_MIN = 5;
const NOTE_MAX = 500;

export class PaymentNotInMismatchError extends Error {
  constructor() {
    super('This application has no payment waiting for review');
    this.name = 'PaymentNotInMismatchError';
  }
}

export function toPaymentReviewView(payment: StoredOnboardingPayment | null) {
  if (!payment || payment.status !== 'mismatch') return null;
  return {
    reference: payment.reference,
    expectedNgn: payment.amountKobo / 100,
    paidNgn:
      payment.receivedAmountKobo === null ||
      payment.receivedAmountKobo === undefined
        ? null
        : payment.receivedAmountKobo / 100,
    currency: payment.receivedCurrency ?? null,
    reviewOutcome: payment.reviewOutcome ?? null,
    reviewNote: payment.reviewNote ?? null,
    reviewedBy: payment.reviewedBy ?? null,
    reviewedAt: payment.reviewedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ReviewOnboardingPaymentMismatchUseCase {
  private readonly logger = new Logger(ReviewOnboardingPaymentMismatchUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    applicationId: string;
    outcome?: unknown;
    note?: string;
  }) {
    const actor = await ensureSystemActor(
      input.accessToken,
      this.tokenService,
      this.users,
      { allowedRoles: SYSTEM_MUTATOR_ROLES },
    );
    const outcome = reviewOutcome(input.outcome);
    const note = reviewNote(input.note);

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    const payment = await this.payments.findLatestForApplication(application.id);
    if (!payment || payment.status !== 'mismatch') {
      throw new PaymentNotInMismatchError();
    }

    const reviewedAt = new Date();
    const saved = await this.payments.reviewMismatch(payment.id, {
      outcome,
      note,
      reviewedBy: actor.id,
      reviewedAt,
    });
    if (!saved) throw new PaymentNotInMismatchError();
    this.logger.log(
      `onboarding_payment_mismatch_reviewed:${payment.reference}:${outcome}:by=${actor.id}`,
    );

    return {
      status: true,
      message:
        outcome === 'refund_needed'
          ? 'Marked as needing a refund'
          : 'Marked as resolved',
      data: {
        applicationId: application.id,
        reference: payment.reference,
        outcome,
        note,
      },
    };
  }
}

function reviewOutcome(value: unknown): MismatchReviewOutcome {
  if (!(MISMATCH_REVIEW_OUTCOMES as readonly unknown[]).includes(value)) {
    throw new OnboardingValidationError(
      'outcome',
      'outcome must be resolved or refund_needed',
    );
  }
  return value as MismatchReviewOutcome;
}

function reviewNote(value: string | undefined): string {
  const note = value?.trim() ?? '';
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) {
    throw new OnboardingValidationError(
      'note',
      `note must be ${NOTE_MIN} to ${NOTE_MAX} characters`,
    );
  }
  return note;
}
