import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RefundCallback } from '../../../payments';
import {
  isOnboardingPayment,
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { PlatformAlertPublisher } from '../../../../platform-alert.publisher';
import { ApplicationPaymentNoticeService } from './application-payment-notice.service';

export const REFUND_ANOMALY_NOTE = 'refunded at provider but status changed';
export const REFUND_NOT_FOUND_NOTE = 'no refund found at provider: check Paystack before retrying';
export const REFUND_FAILED_NOTE = 'The payment provider could not complete the refund';

@Injectable()
export class RefundSettlementService {
  private readonly logger = new Logger(RefundSettlementService.name);

  constructor(
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(ApplicationPaymentNoticeService)
    private readonly notices: ApplicationPaymentNoticeService,
    @Inject(PlatformAlertPublisher)
    private readonly alerts: PlatformAlertPublisher,
  ) {}

  /** The provider has returned the money. False when the payment had already moved on, which is flagged. */
  async completed(payment: StoredOnboardingPayment, providerRefundId: string | null): Promise<boolean> {
    const recorded = await this.payments.markRefunded(payment.id, {
      refundedAt: new Date(),
      refundReference: providerRefundId ?? payment.refundReference ?? null,
    });
    if (recorded) {
      await this.notices.paymentRefunded(payment.applicationId);
      return true;
    }
    const current = await this.payments.findByReference(payment.reference);
    if (current?.status === 'refunded') return true;
    await this.flagAnomaly(payment);
    return false;
  }

  /** The provider gave up on a queued refund: release the claim so staff can try again. */
  async failed(payment: StoredOnboardingPayment, reason: string, onlyIfClaimedBefore?: Date): Promise<void> {
    await this.payments.recordRefundError(payment.id, reason, onlyIfClaimedBefore);
    this.logger.warn(`onboarding_refund_failed:${payment.reference}:${reason}`);
  }

  /** The provider has no record of the refund long after it was claimed: release it and ask staff to check by hand. */
  async missingAtProvider(payment: StoredOnboardingPayment, onlyIfClaimedBefore: Date): Promise<void> {
    await this.failed(payment, REFUND_NOT_FOUND_NOTE, onlyIfClaimedBefore);
    await this.alerts.raise({
      alertType: 'billing_alerts',
      severity: 'high',
      subject: `Onboarding refund not found at provider (${payment.reference})`,
      body: 'A refund was requested but the payment provider has no record of it. Check the transaction on Paystack before retrying, or the customer may be refunded twice.',
      context: { applicationId: payment.applicationId, reference: payment.reference },
    });
  }

  async onCallback(reference: string, refund: RefundCallback): Promise<void> {
    const payment = reference ? await this.payments.findByReference(reference) : null;
    if (!payment || !isOnboardingPayment(payment)) {
      this.logger.log(`refund_callback_ignored:${reference || 'no-reference'}:${refund.status}`);
      return;
    }
    if (refund.status === 'processed' && payment.status !== 'refunded') {
      await this.completed(payment, refund.providerRefundId);
    } else if (refund.status === 'failed' && payment.status === 'mismatch') {
      await this.failed(payment, REFUND_FAILED_NOTE);
    }
  }

  private async flagAnomaly(payment: StoredOnboardingPayment): Promise<void> {
    await this.payments.flagForReview(payment.id, REFUND_ANOMALY_NOTE);
    this.logger.error(`onboarding_refund_anomaly:${payment.reference}`);
    await this.alerts.raise({
      alertType: 'billing_alerts',
      severity: 'high',
      subject: `Onboarding refund needs review (${payment.reference})`,
      body: 'The provider refunded this payment, but it is no longer in mismatch. Check the payment and the application before doing anything else.',
      context: { applicationId: payment.applicationId, reference: payment.reference },
    });
  }
}
