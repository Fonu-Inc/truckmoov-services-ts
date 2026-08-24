import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { PAYMENT_GATEWAY, type PaymentGateway } from './contexts/payments';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class InvalidPaymentGatewayError extends Error {}
export class PlanNotFoundError extends Error {}

@Injectable()
export class CreatePaymentIntentUseCase {
  private readonly logger = new Logger(CreatePaymentIntentUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGateway,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      planCode: string;
      billingCycle: 'monthly' | 'yearly';
      gateway: 'paystack' | 'momo';
      phone?: string;
      redirectUrl?: string;
    },
  ) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot create payment intents');
    }

    const plan = await this.planRepository.findByCode(payload.planCode);
    if (!plan) throw new PlanNotFoundError('Plan not found');

    const priceNgn =
      payload.billingCycle === 'yearly'
        ? (plan.yearlyMonthlyEquivalentNgn ?? plan.monthlyPriceNgn)
        : plan.monthlyPriceNgn;

    const reference = `TM-${actor.tenantId}-${Date.now()}`;

    const onboarding = await this.onboardingRepository.findByTenantId(actor.tenantId);
    if (onboarding) {
      await this.onboardingRepository.save({
        ...onboarding,
        paymentReference: reference,
        updatedAt: new Date(),
      });
    }

    if (payload.gateway === 'momo') {
      return {
        status: true,
        message: 'success',
        data: {
          gateway: 'momo' as const,
          reference,
          ussdString: `*737*${reference}#`,
          message: 'A USSD push will be sent to your phone. Dial the USSD string to complete payment.',
        },
      };
    }

    const amountKobo = priceNgn != null ? priceNgn * 100 : 0;
    const charge = await this.paymentGateway.initiateCharge({
      reference,
      amountKobo,
      customerEmail: actor.email,
      redirectUrl: payload.redirectUrl,
      metadata: {
        purpose: 'subscription',
        tenantId: actor.tenantId,
        planCode: payload.planCode,
        billingCycle: payload.billingCycle,
      },
    });

    if (!charge.authorizationUrl) {
      return {
        status: true,
        message: 'success',
        data: {
          gateway: charge.provider,
          reference: charge.reference,
          authorizationUrl: null,
          message: 'Payment gateway not configured',
        },
      };
    }

    return {
      status: true,
      message: 'success',
      data: {
        gateway: charge.provider,
        reference: charge.reference,
        authorizationUrl: charge.authorizationUrl,
      },
    };
  }
}
