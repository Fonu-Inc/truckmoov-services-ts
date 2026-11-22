import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_GATEWAY, PaymentGatewayError, type PaymentGateway } from '../../../payments';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import { ConfirmApplicationPaymentUseCase, GetApplicationOrderUseCase } from './pay-for-application.use-cases';
import { EnforcementRestoreService } from '../../../../enforcement-restore.service';

/**
 * Asks the provider about the latest pending charge when its webhook is late,
 * and settles it through the same path the webhook uses. Answers like GET order.
 */
@Injectable()
export class VerifyApplicationPaymentUseCase {
  private readonly logger = new Logger(VerifyApplicationPaymentUseCase.name);

  constructor(
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ConfirmApplicationPaymentUseCase)
    private readonly confirmPayment: ConfirmApplicationPaymentUseCase,
    @Inject(GetApplicationOrderUseCase)
    private readonly order: GetApplicationOrderUseCase,
    @Inject(EnforcementRestoreService)
    private readonly enforcementRestore: EnforcementRestoreService,
  ) {}

  async execute(applicationId: string, applicationToken: string) {
    const application = await this.getApplication.resolve(applicationId, applicationToken);
    const payment = await this.payments.findLatestForApplication(application.id);

    if (payment?.status === 'pending' && this.gateway.isConfigured()) {
      try {
        const charge = await this.gateway.verifyCharge(payment.reference);
        if (charge.paid) {
          await this.confirmPayment.execute(payment.reference, true, charge);
          void this.enforcementRestore.onApplicationPaymentSettled(payment.reference);
        }
      } catch (error) {
        if (!(error instanceof PaymentGatewayError)) throw error;
        // The webhook still settles it; the applicant keeps polling.
        this.logger.warn(`onboarding_payment_verify_failed:${payment.reference}:${error.message}`);
      }
    }

    return this.order.execute(applicationId, applicationToken);
  }
}
