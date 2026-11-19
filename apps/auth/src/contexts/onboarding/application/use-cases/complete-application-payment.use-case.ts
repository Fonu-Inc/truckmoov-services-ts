import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
} from './pay-for-application.use-cases';

/**
 * Demo checkout for an onboarding application.
 *
 * Creates the same pending row as the real flow, then settles it server-side,
 * so the browser never visits a provider. The controller chooses this path
 * only while `PAYMENT_DEMO_MODE` is on.
 */
@Injectable()
export class CompleteApplicationPaymentUseCase {
  constructor(
    @Inject(CreateApplicationPaymentUseCase)
    private readonly startPayment: CreateApplicationPaymentUseCase,
    @Inject(ConfirmApplicationPaymentUseCase)
    private readonly confirmPayment: ConfirmApplicationPaymentUseCase,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    redirectUrl?: string;
  }) {
    const started = await this.startPayment.execute(input, { demo: true });
    const payment = await this.payments.findByReference(
      started.data.reference,
    );
    if (!payment) {
      throw new Error(`Payment ${started.data.reference} was not saved`);
    }
    await this.confirmPayment.execute(payment.reference, true, {
      amountKobo: payment.amountKobo,
      currency: 'NGN',
      channel: 'demo',
    });
    return {
      ...started,
      message: 'Payment confirmed',
      data: {
        ...started.data,
        authorizationUrl: null,
        provider: 'demo',
        paid: true,
      },
    };
  }
}
