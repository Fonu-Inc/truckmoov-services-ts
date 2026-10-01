import { randomUUID } from 'node:crypto';
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
  type StoredSubscriptionPlan,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';
import { OnboardingNotFoundError } from './activate-subscription.use-case';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type PendingSubscriptionCharge,
  type StoredTenantOnboarding,
  type TenantBillingCycle,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class InvalidPaymentGatewayError extends Error {}
export class PlanNotFoundError extends Error {}
export class InvalidPlanPriceError extends Error {}
export class PlanChangeNotAllowedError extends Error {}

const MAX_PENDING_CHARGES = 5;
const MONTHS_PER_YEAR = 12;

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

    const amountKobo = chargeKobo(plan, payload.billingCycle);

    const onboarding = await this.onboardingRepository.findByTenantId(actor.tenantId);
    if (!onboarding) throw new OnboardingNotFoundError('Onboarding record not found');
    assertPlanChangeAllowed(onboarding, plan.code);

    const reference = `TM-${actor.tenantId}-${randomUUID()}`;
    await this.recordPendingCharge(onboarding, {
      reference,
      amountKobo,
      planCode: plan.code,
      billingCycle: payload.billingCycle,
    });

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

  private async recordPendingCharge(
    onboarding: StoredTenantOnboarding,
    charge: PendingSubscriptionCharge,
  ): Promise<void> {
    await this.onboardingRepository.appendPendingCharge(
      onboarding.tenantId,
      charge,
      MAX_PENDING_CHARGES,
    );
  }
}

function chargeKobo(plan: StoredSubscriptionPlan, cycle: TenantBillingCycle): number {
  const monthlyNgn = cycle === 'yearly' ? plan.yearlyMonthlyEquivalentNgn : plan.monthlyPriceNgn;
  if (monthlyNgn == null || monthlyNgn <= 0) {
    throw new InvalidPlanPriceError(`Plan has no payable ${cycle} price`);
  }
  const months = cycle === 'yearly' ? MONTHS_PER_YEAR : 1;
  return Math.round(monthlyNgn * 100) * months;
}

function assertPlanChangeAllowed(onboarding: StoredTenantOnboarding, planCode: string): void {
  const current = onboarding.subscription.planCode;
  if (current && current !== planCode) {
    throw new PlanChangeNotAllowedError(
      'Tenant already has a plan; use the upgrade flow to change plans',
    );
  }
  if (current === planCode && onboarding.subscriptionActivatedAt) {
    throw new PlanChangeNotAllowedError('Plan is already active');
  }
}
