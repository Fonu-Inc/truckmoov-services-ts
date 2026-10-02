import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type PaymentGateway,
  type RefundLookup,
} from '../../../payments';
import {
  isOnboardingPayment,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { REFUND_FAILED_NOTE, RefundSettlementService } from './refund-settlement.service';

export const REFUND_CLAIM_STALE_MS = 30 * 60 * 1000;
export const REFUND_MISSING_GIVE_UP_MS = 24 * 60 * 60 * 1000;

export type ReconcileOutcome = 'skipped' | 'waiting' | 'settled' | 'released';

/**
 * Settles a refund claim whose provider callback never arrived, by asking the
 * provider and then following the same path a callback would.
 */
@Injectable()
export class RefundReconciliationService {
  private readonly logger = new Logger(RefundReconciliationService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(RefundSettlementService) private readonly settlement: RefundSettlementService,
  ) {}

  /** A claim younger than this is never touched: the provider call or its callback may still be on the way. */
  staleBefore(now: Date): Date {
    return new Date(now.getTime() - REFUND_CLAIM_STALE_MS);
  }

  async reconcile(payment: StoredOnboardingPayment, now: Date = new Date()): Promise<ReconcileOutcome> {
    const claimedAt = payment.refundPendingAt;
    const staleBefore = this.staleBefore(now);
    if (payment.status !== 'mismatch' || !claimedAt || claimedAt >= staleBefore) return 'skipped';
    if (!isOnboardingPayment(payment) || payment.provider !== this.gateway.name) return 'skipped';

    const lookup = await this.lookup(payment);
    if (!lookup) return 'waiting';
    return this.route(payment, lookup, claimedAt, now, staleBefore);
  }

  private async route(
    payment: StoredOnboardingPayment,
    lookup: RefundLookup,
    claimedAt: Date,
    now: Date,
    staleBefore: Date,
  ): Promise<ReconcileOutcome> {
    if (lookup.status === 'processed') {
      await this.settlement.completed(payment, lookup.providerRefundId);
      return 'settled';
    }
    if (lookup.status === 'failed') {
      await this.settlement.failed(payment, REFUND_FAILED_NOTE, staleBefore);
      return 'released';
    }
    const missingTooLong = now.getTime() - claimedAt.getTime() > REFUND_MISSING_GIVE_UP_MS;
    if (lookup.status === 'unknown' && missingTooLong) {
      await this.settlement.missingAtProvider(payment, staleBefore);
      return 'released';
    }
    return 'waiting';
  }

  private async lookup(payment: StoredOnboardingPayment): Promise<RefundLookup | null> {
    try {
      return await this.gateway.getRefundStatus(payment.reference);
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      this.logger.warn(`onboarding_refund_lookup_failed:${payment.reference}:${error.message}`);
      return null;
    }
  }
}
