import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from '../../../../system-authz';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type PaymentGateway,
  type RefundResult,
} from '../../../payments';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { ApplicationNotFoundError } from '@auth/onboarding/domain/onboarding-application.support';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { REFUND_FAILED_NOTE, RefundSettlementService } from '../services/refund-settlement.service';
import { RefundReconciliationService } from '../services/refund-reconciliation.service';
import { reviewNote } from './review-onboarding-payment.use-case';
import { resolveOnboardingPayment } from './support/resolve-onboarding-payment';

export class PaymentNotRefundableError extends Error {
  constructor() {
    super('Only a wrong-amount payment marked as needing a refund can be refunded');
    this.name = 'PaymentNotRefundableError';
  }
}

export class RefundInProgressError extends Error {
  constructor() {
    super('Refund already in progress');
    this.name = 'RefundInProgressError';
  }
}

export class RefundStateConflictError extends Error {
  constructor() {
    super('The provider refunded this payment but it is no longer in mismatch. It was flagged for review.');
    this.name = 'RefundStateConflictError';
  }
}

export class RefundRefusedError extends Error {
  constructor(readonly reason: string) {
    super(`The payment provider refused the refund: ${reason}`);
    this.name = 'RefundRefusedError';
  }
}

function assertRefundable(payment: StoredOnboardingPayment | null): asserts payment is StoredOnboardingPayment {
  if (!payment) throw new PaymentNotRefundableError();
  const awaitingRefund = payment.status === 'mismatch' && payment.reviewOutcome === 'refund_needed';
  const alreadyRefunded = payment.status === 'refunded' && payment.reviewOutcome === 'refund_needed';
  if (!awaitingRefund && !alreadyRefunded) throw new PaymentNotRefundableError();
}

@Injectable()
export class RefundOnboardingPaymentUseCase {
  private readonly logger = new Logger(RefundOnboardingPaymentUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(RefundSettlementService)
    private readonly settlement: RefundSettlementService,
    @Inject(RefundReconciliationService)
    private readonly reconciliation: RefundReconciliationService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * Asks the provider to send the money back. Idempotent: a refunded payment
   * answers success without another provider call. A queued refund keeps the
   * claim and finishes on the provider's callback; a refusal is kept on the
   * payment so staff can read why and try again.
   */
  async execute(input: { accessToken: string; applicationId: string; paymentId?: string; note?: string }) {
    const actor = await ensureSystemActor(input.accessToken, this.tokenService, this.users, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
    });
    const note = reviewNote(input.note);

    const application = await this.applications.findById(input.applicationId);
    if (!application) throw new ApplicationNotFoundError();
    const payment = await resolveOnboardingPayment(this.payments, application.id, {
      paymentId: input.paymentId,
      includeRefunded: true,
    });
    assertRefundable(payment);

    if (payment.status === 'refunded') {
      return this.result(application.id, payment, note, payment.refundReference ?? null, 'refunded', actor.id);
    }

    const claimed = await this.claim(payment, note, actor.id);
    if (!claimed) return this.answerLostClaim(application.id, payment, note, actor.id);

    const refund = await this.refundThroughProvider(payment);
    this.logger.log(`onboarding_payment_refund_${refund.status}:${payment.reference}:by=${actor.id}`);
    if (refund.status === 'processed') {
      const done = await this.settlement.completed(payment, refund.providerRefundId);
      if (!done) throw new RefundStateConflictError();
      return this.result(application.id, payment, note, refund.providerRefundId, 'refunded', actor.id);
    }
    await this.payments.recordRefundAccepted(payment.id, refund.providerRefundId);
    return this.result(application.id, payment, note, refund.providerRefundId, 'processing', actor.id);
  }

  /** A held claim is only ever released by reconciliation, and never before it is 30 minutes old. */
  private async claim(payment: StoredOnboardingPayment, note: string, actorId: string): Promise<boolean> {
    const claim = { note, requestedBy: actorId };
    if (await this.payments.claimRefund(payment.id, claim)) return true;
    const current = await this.payments.findByReference(payment.reference);
    if (!current) return false;
    await this.reconciliation.reconcile(current);
    return this.payments.claimRefund(payment.id, claim);
  }

  private async answerLostClaim(
    applicationId: string,
    payment: StoredOnboardingPayment,
    note: string,
    actorId: string,
  ) {
    const current = await this.payments.findByReference(payment.reference);
    if (current?.status === 'refunded') {
      return this.result(applicationId, current, note, current.refundReference ?? null, 'refunded', actorId);
    }
    if (current?.status === 'mismatch' && current.refundPendingAt) throw new RefundInProgressError();
    throw new PaymentNotRefundableError();
  }

  private async refundThroughProvider(payment: StoredOnboardingPayment): Promise<RefundResult> {
    if (payment.provider !== this.gateway.name) {
      return this.refuse(payment, `This payment was taken through ${payment.provider}`);
    }
    let refund: RefundResult;
    try {
      refund = await this.gateway.refund(payment.reference);
    } catch (error) {
      if (error instanceof PaymentGatewayError) return this.refuse(payment, error.message);
      await this.payments.recordRefundError(payment.id, 'The refund could not be completed');
      throw error;
    }
    if (refund.status === 'failed') return this.refuse(payment, REFUND_FAILED_NOTE);
    return refund;
  }

  private async refuse(payment: StoredOnboardingPayment, reason: string): Promise<never> {
    await this.payments.recordRefundError(payment.id, reason);
    this.logger.warn(`onboarding_refund_refused:${payment.reference}:${reason}`);
    throw new RefundRefusedError(reason);
  }

  private result(
    applicationId: string,
    payment: StoredOnboardingPayment,
    note: string,
    refundReference: string | null,
    refundStatus: 'refunded' | 'processing',
    actorId: string,
  ) {
    return {
      actorId,
      status: true,
      message: {
        refunded: 'Refund issued',
        processing: 'Refund accepted by the provider, waiting for it to finish',
      }[refundStatus],
      data: {
        applicationId,
        paymentId: payment.id,
        reference: payment.reference,
        refundReference,
        note,
        refundStatus,
        alreadyRefunded: payment.status === 'refunded',
      },
    };
  }
}
