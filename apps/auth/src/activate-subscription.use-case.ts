import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaidAmount } from './contexts/payments';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type PendingSubscriptionCharge,
  type StoredTenantOnboarding,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';
import { PlatformAlertPublisher } from './platform-alert.publisher';

export class OnboardingNotFoundError extends Error {}

const SETTLEMENT_CURRENCY = 'NGN';

@Injectable()
export class ActivateSubscriptionUseCase {
  private readonly logger = new Logger(ActivateSubscriptionUseCase.name);

  constructor(
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
  ) {}

  async execute(
    tenantId: string,
    reference: string,
    selection?: { planCode?: string; billingCycle?: string },
    paid?: PaidAmount,
  ): Promise<void> {
    const onboarding = await this.onboardingRepository.findByTenantId(tenantId);
    if (!onboarding) throw new OnboardingNotFoundError('Onboarding record not found');

    if (this.isAlreadyActivated(onboarding, reference)) return;

    const charge = onboarding.subscription.pendingCharges?.find(
      (pending) => pending.reference === reference,
    );
    if (!charge) {
      this.logger.warn(`No pending subscription charge ${reference} for tenant ${tenantId}`);
      // Every tenant callback lands here; only one naming a plan was a subscription payment.
      if (selection?.planCode) await this.raiseUnapplied(tenantId, reference, 'no pending subscription charge matches it', paid);
      return;
    }
    if (!this.paymentMatches(tenantId, charge, paid)) {
      return this.raiseUnapplied(tenantId, reference, 'the amount or currency does not match the pending charge', paid);
    }
    if (!this.planChangeAllowed(tenantId, onboarding, charge)) {
      return this.raiseUnapplied(tenantId, reference, `it targets plan ${charge.planCode}, not the tenant's current plan`, paid);
    }

    await this.onboardingRepository.activateSubscription(tenantId, charge, new Date());
  }

  private raiseUnapplied(tenantId: string, reference: string, why: string, paid?: PaidAmount): Promise<void> {
    return this.alerts.raise({
      alertType: 'billing_alerts',
      severity: 'high',
      subject: `Subscription payment not applied (${reference})`,
      body: `A successful payment from tenant ${tenantId} was not applied because ${why}. Review it for a refund or a manual activation.`,
      context: { tenantId, reference, paidKobo: paid?.amountKobo ?? null, currency: paid?.currency ?? null },
    });
  }

  private isAlreadyActivated(onboarding: StoredTenantOnboarding, reference: string): boolean {
    return onboarding.paymentReference === reference && Boolean(onboarding.subscriptionActivatedAt);
  }

  private paymentMatches(
    tenantId: string,
    charge: PendingSubscriptionCharge,
    paid?: PaidAmount,
  ): boolean {
    const currency = paid?.currency?.toUpperCase() ?? SETTLEMENT_CURRENCY;
    if (paid?.amountKobo === charge.amountKobo && currency === SETTLEMENT_CURRENCY) return true;
    this.logger.error(
      `Subscription payment ${charge.reference} for tenant ${tenantId} expected ${charge.amountKobo} ${SETTLEMENT_CURRENCY}, got ${paid?.amountKobo ?? 'unknown'} ${paid?.currency ?? 'unknown'}; not activated`,
    );
    return false;
  }

  private planChangeAllowed(
    tenantId: string,
    onboarding: StoredTenantOnboarding,
    charge: PendingSubscriptionCharge,
  ): boolean {
    const current = onboarding.subscription.planCode;
    if (!current || current === charge.planCode) return true;
    this.logger.error(
      `Paid subscription ${charge.reference} for tenant ${tenantId} targets plan ${charge.planCode} but tenant is on ${current}; not activated, needs refund or manual review`,
    );
    return false;
  }
}
