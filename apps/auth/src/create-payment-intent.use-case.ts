import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
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

type PaystackInitializeResponse = {
  status: boolean;
  data?: { authorization_url: string; access_code: string; reference: string };
  message?: string;
};

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

    const secretKey = this.config.payment.paystackSecretKey;
    if (!secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not set');
      return {
        status: true,
        message: 'success',
        data: {
          gateway: 'paystack' as const,
          reference,
          authorizationUrl: null,
          message: 'Payment gateway not configured',
        },
      };
    }

    const amountKobo = priceNgn != null ? priceNgn * 100 : 0;
    const paystackBaseUrl = this.config.payment.paystackBaseUrl.replace(/\/+$/, '');
    const { data: json } = await axios.post<PaystackInitializeResponse>(
      `${paystackBaseUrl}/transaction/initialize`,
      {
        email: actor.email,
        amount: amountKobo,
        reference,
        ...(payload.redirectUrl ? { callback_url: payload.redirectUrl } : {}),
        metadata: {
          tenantId: actor.tenantId,
          planCode: payload.planCode,
          billingCycle: payload.billingCycle,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      },
    );

    if (!json.status || !json.data) {
      throw new Error(json.message ?? 'Paystack initialization failed');
    }

    return {
      status: true,
      message: 'success',
      data: {
        gateway: 'paystack' as const,
        reference: json.data.reference,
        authorizationUrl: json.data.authorization_url,
        accessCode: json.data.access_code,
      },
    };
  }
}
