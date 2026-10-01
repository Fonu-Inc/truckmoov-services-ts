import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type ChargeRequest,
  type PaidAmount,
  type PaymentGateway,
} from '../../../payments';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
  type StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import {
  buildOrderSummary,
  installationFeeFor,
  toKobo,
  type OnboardingOrderSummary,
} from '@auth/onboarding/domain/onboarding-order';
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import { assertStageAdvance } from '@auth/onboarding/domain/onboarding-stage';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import { loadInstallationFees } from './support/installation-fees';
import { loadTaxRateBp } from './support/billing-terms';
import { methodFromChannel } from '@auth/onboarding/domain/payment-method';
import { InvoiceIssuanceService } from '../services/invoice-issuance.service';
import { OrderQuotationService } from '../services/order-quotation.service';

const PENDING_REUSE_WINDOW_MS = 30 * 60 * 1000;
const PAID_CURRENCY = 'NGN';

export class ApplicationNotPayableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ApplicationNotPayableError';
  }
}

export class BillingEmailNotVerifiedError extends Error {
  constructor() {
    super('Verify the billing email before paying');
    this.name = 'BillingEmailNotVerifiedError';
  }
}

export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super('No payment provider is configured');
    this.name = 'PaymentProviderUnavailableError';
  }
}

export class ChargeRefusedError extends Error {
  constructor() {
    super('The payment provider refused to start this payment. Try again shortly.');
    this.name = 'ChargeRefusedError';
  }
}

@Injectable()
export class GetApplicationOrderUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(BILLING_SETTINGS_REPOSITORY)
    private readonly settings: BillingSettingsRepository,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    const payment = await this.payments.findLatestForApplication(
      application.id,
    );
    const summary =
      (payment?.status === 'paid' ? payment.orderSummary : null) ??
      (await priceApplication(
        this.applications,
        this.plans,
        this.settings,
        application,
      ));

    return {
      status: true,
      message: 'success',
      data: {
        order: summary,
        stage: application.stage,
        payable: application.stage === 'payment' && payment?.status !== 'paid',
        billingEmail: application.billingEmail,
        billingEmailVerified: application.billingEmailVerifiedAt !== null,
        payment: payment
          ? {
              reference: payment.reference,
              status: payment.status,
              paidAt: payment.paidAt?.toISOString() ?? null,
            }
          : null,
      },
    };
  }
}

@Injectable()
export class CreateApplicationPaymentUseCase {
  private readonly logger = new Logger(CreateApplicationPaymentUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY)
    private readonly plans: M2mLicensePlanRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(BILLING_SETTINGS_REPOSITORY)
    private readonly settings: BillingSettingsRepository,
    @Inject(OrderQuotationService)
    private readonly quotations: OrderQuotationService,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    redirectUrl?: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );

    if (application.stage !== 'payment') {
      throw new ApplicationNotPayableError(
        `An application at the ${application.stage} stage cannot be paid for`,
      );
    }
    // The receipt has to reach somebody. Verified here rather than trusted
    // from the form, because this is the last point before money moves.
    if (!application.billingEmail || application.billingEmailVerifiedAt === null) {
      throw new BillingEmailNotVerifiedError();
    }
    if (!this.gateway.isConfigured()) {
      throw new PaymentProviderUnavailableError();
    }

    const summary = await priceApplication(
      this.applications,
      this.plans,
      this.settings,
      application,
    );

    const existing = await this.payments.findLatestForApplication(
      application.id,
    );
    if (existing?.status === 'paid') {
      throw new ApplicationNotPayableError('This application is already paid');
    }

    const amountKobo = toKobo(summary.totalNgn);
    const quotation = await this.quotations.ensure(application, summary);
    const reusable = await this.payments.findReusablePending(
      application.id,
      amountKobo,
      summary.planCode,
      new Date(Date.now() - PENDING_REUSE_WINDOW_MS),
    );
    if (reusable?.authorizationUrl) {
      return this.respond(reusable.reference, reusable.authorizationUrl, reusable.provider, summary);
    }

    const payment = await this.recordPending(application, summary, amountKobo, quotation.id);
    const charge = await this.chargeOrDiscard(payment, input.redirectUrl, application.id);
    await this.payments.setAuthorizationUrl(payment.id, charge.authorizationUrl);

    this.logger.log(`onboarding_payment_started:${payment.reference}`);
    return this.respond(payment.reference, charge.authorizationUrl, charge.provider, summary);
  }

  private respond(
    reference: string,
    authorizationUrl: string | null,
    provider: string,
    order: OnboardingOrderSummary,
  ) {
    return {
      status: true,
      message: 'Payment initialised',
      data: { reference, authorizationUrl, provider, order },
    };
  }

  private async recordPending(
    application: StoredOnboardingApplication,
    summary: OnboardingOrderSummary,
    amountKobo: number,
    quotationId: string,
  ): Promise<StoredOnboardingPayment> {
    const now = new Date();
    const payment: StoredOnboardingPayment = {
      id: this.idGenerator.generate(),
      applicationId: application.id,
      // Prefixed by application rather than tenant: no tenant exists yet, and
      // the callback has to find its way back to an application.
      reference: `FPA-${application.reference}-${randomBytes(6).toString('hex')}`,
      provider: this.gateway.name,
      // Recorded from the summary, never from the request: the client chooses
      // a plan, it does not get to name a price.
      amountKobo,
      authorizationUrl: null,
      billingEmail: application.billingEmail ?? '',
      planCode: summary.planCode,
      deviceCount: summary.deviceCount,
      orderSummary: summary,
      quotationId,
      invoiceId: null,
      method: null,
      customerName: application.organizationName,
      note: null,
      autoReconciled: true,
      status: 'pending',
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.payments.save(payment);
    return payment;
  }

  private async chargeOrDiscard(
    payment: StoredOnboardingPayment,
    redirectUrl: string | undefined,
    applicationId: string,
  ) {
    try {
      return await this.initiateCharge({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
        customerEmail: payment.billingEmail,
        redirectUrl,
        metadata: { applicationId, kind: 'onboarding' },
      });
    } catch (error) {
      await this.payments.deleteUnstarted(payment.id);
      throw error;
    }
  }

  private async initiateCharge(request: ChargeRequest) {
    try {
      return await this.gateway.initiateCharge(request);
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      this.logger.warn(`onboarding_payment_refused:${request.reference}:${error.provider}:${error.message}`);
      throw new ChargeRefusedError();
    }
  }
}

const RETRYABLE_STATUSES: readonly string[] = ['pending', 'failed', 'mismatch'];

function canSettle(status: string, succeeded: boolean): boolean {
  return succeeded ? RETRYABLE_STATUSES.includes(status) : status === 'pending';
}

@Injectable()
export class ConfirmApplicationPaymentUseCase {
  private readonly logger = new Logger(ConfirmApplicationPaymentUseCase.name);
  private readonly advancing = new Map<string, Promise<void>>();

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(InvoiceIssuanceService)
    private readonly billing: InvoiceIssuanceService,
  ) {}

  /**
   * Acts on a callback the gateway has already proven genuine.
   *
   * Idempotent: providers retry, and a second delivery of the same successful
   * callback must not advance the stage twice or look like a second payment.
   * A retry after a failed advance finishes the advance for the paid row.
   */
  async execute(reference: string, succeeded: boolean, paid?: PaidAmount): Promise<void> {
    const payment = await this.payments.findByReference(reference);
    if (!payment) return;
    if (payment.status === 'paid') {
      const now = new Date();
      await this.advanceApplication(payment.applicationId, now);
      await this.billing.repair(payment, now);
      return;
    }
    if (!canSettle(payment.status, succeeded)) return;

    if (!succeeded) {
      await this.payments.settlePending(payment.id, 'failed', null, {
        method: methodFromChannel(paid?.channel),
        autoReconciled: true,
      });
      this.logger.warn(`onboarding_payment_failed:${reference}`);
      return;
    }

    if (!paidInFull(payment.amountKobo, paid)) {
      await this.payments.settlePending(payment.id, 'mismatch', null, {
        method: methodFromChannel(paid?.channel),
        autoReconciled: false,
      });
      this.logger.error(
        `onboarding_payment_mismatch:${reference}:expected=${payment.amountKobo}:paid=${paid?.amountKobo ?? 'unknown'}:${paid?.currency ?? 'unknown'}`,
      );
      return;
    }

    const now = new Date();
    const settled = await this.payments.settlePending(payment.id, 'paid', now, {
      method: methodFromChannel(paid?.channel) ?? 'other',
      autoReconciled: true,
    });
    if (!settled) return;
    await this.advanceApplication(payment.applicationId, now);
    await this.billing.paymentReceived(payment, now);
    this.logger.log(`onboarding_payment_confirmed:${reference}`);
  }

  private advanceApplication(applicationId: string, now: Date): Promise<void> {
    const running = this.advancing.get(applicationId);
    if (running) return running;
    const run = this.advance(applicationId, now).finally(() =>
      this.advancing.delete(applicationId),
    );
    this.advancing.set(applicationId, run);
    return run;
  }

  private async advance(applicationId: string, now: Date) {
    const application = await this.applications.findById(applicationId);
    if (application?.stage !== 'payment') return;

    assertStageAdvance(application.stage, 'installation_scheduling');
    await this.applications.save({
      ...application,
      stage: 'installation_scheduling',
      updatedAt: now,
    });
  }
}

function paidInFull(expectedKobo: number, paid?: PaidAmount): boolean {
  return (
    paid?.amountKobo === expectedKobo &&
    paid.currency?.toUpperCase() === PAID_CURRENCY
  );
}

async function priceApplication(
  applications: OnboardingApplicationRepository,
  plans: M2mLicensePlanRepository,
  settings: BillingSettingsRepository,
  application: StoredOnboardingApplication,
): Promise<OnboardingOrderSummary> {
  if (!application.m2mPlanCode) {
    throw new ApplicationNotPayableError('No M2M licence plan was chosen');
  }

  const plan = await plans.findByCode(application.m2mPlanCode);
  if (!plan) {
    throw new ApplicationNotPayableError(
      'The chosen M2M licence plan is no longer available',
    );
  }

  const deviceCount = requestedDeviceCount(
    await applications.findDeviceRequestsByApplicationId(application.id),
  );
  if (deviceCount === 0) {
    throw new ApplicationNotPayableError('No devices were requested');
  }

  const fees = await loadInstallationFees(settings);
  return buildOrderSummary(
    plan as StoredM2mLicensePlan,
    deviceCount,
    installationFeeFor(application.applicantType, fees),
    await loadTaxRateBp(settings),
  );
}
