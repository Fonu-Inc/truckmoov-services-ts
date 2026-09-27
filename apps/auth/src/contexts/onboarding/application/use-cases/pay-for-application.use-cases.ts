import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type ChargeRequest,
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
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  buildOrderSummary,
  toKobo,
  type OnboardingOrderSummary,
} from '@auth/onboarding/domain/onboarding-order';
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import { assertStageAdvance } from '@auth/onboarding/domain/onboarding-stage';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

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
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(
      applicationId,
      applicationToken,
    );
    const summary = await priceApplication(
      this.applications,
      this.plans,
      application,
    );
    const payment = await this.payments.findLatestForApplication(
      application.id,
    );

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
      application,
    );

    const existing = await this.payments.findLatestForApplication(
      application.id,
    );
    if (existing?.status === 'paid') {
      throw new ApplicationNotPayableError('This application is already paid');
    }

    const now = new Date();
    // Prefixed by application rather than tenant: no tenant exists yet, and
    // the callback has to find its way back to an application.
    const reference = `FPA-${application.reference}-${now.getTime()}`;

    const charge = await this.initiateCharge({
      reference,
      amountKobo: toKobo(summary.totalNgn),
      customerEmail: application.billingEmail,
      redirectUrl: input.redirectUrl,
      metadata: { applicationId: application.id, kind: 'onboarding' },
    });

    await this.payments.save({
      id: this.idGenerator.generate(),
      applicationId: application.id,
      reference,
      provider: charge.provider,
      // Recorded from the summary, never from the request: the client chooses
      // a plan, it does not get to name a price.
      amountKobo: toKobo(summary.totalNgn),
      billingEmail: application.billingEmail,
      planCode: summary.planCode,
      deviceCount: summary.deviceCount,
      status: 'pending',
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.log(`onboarding_payment_started:${reference}`);

    return {
      status: true,
      message: 'Payment initialised',
      data: {
        reference,
        authorizationUrl: charge.authorizationUrl,
        provider: charge.provider,
        order: summary,
      },
    };
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

@Injectable()
export class ConfirmApplicationPaymentUseCase {
  private readonly logger = new Logger(ConfirmApplicationPaymentUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
  ) {}

  /**
   * Acts on a callback the gateway has already proven genuine.
   *
   * Idempotent: providers retry, and a second delivery of the same successful
   * callback must not advance the stage twice or look like a second payment.
   */
  async execute(reference: string, succeeded: boolean): Promise<void> {
    const payment = await this.payments.findByReference(reference);
    if (!payment) return;
    if (payment.status === 'paid') return;

    const now = new Date();
    await this.payments.save({
      ...payment,
      status: succeeded ? 'paid' : 'failed',
      paidAt: succeeded ? now : null,
      updatedAt: now,
    });

    if (!succeeded) {
      this.logger.warn(`onboarding_payment_failed:${reference}`);
      return;
    }

    const application = await this.applications.findById(payment.applicationId);
    if (!application) return;

    assertStageAdvance(application.stage, 'installation_scheduling');
    await this.applications.save({
      ...application,
      stage: 'installation_scheduling',
      updatedAt: now,
    });
    this.logger.log(`onboarding_payment_confirmed:${reference}`);
  }
}

async function priceApplication(
  applications: OnboardingApplicationRepository,
  plans: M2mLicensePlanRepository,
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

  return buildOrderSummary(plan as StoredM2mLicensePlan, deviceCount);
}
