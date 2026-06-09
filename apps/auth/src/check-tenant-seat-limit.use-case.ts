import { Inject, Injectable } from '@nestjs/common';
import {
  INVITE_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
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

export class TenantSeatLimitReachedError extends Error {
  constructor(maxUsers: number) {
    super(
      `Your plan allows a maximum of ${maxUsers} user${maxUsers === 1 ? '' : 's'}. Upgrade your plan to add more.`,
    );
  }
}

@Injectable()
export class CheckTenantSeatLimitUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly planRepository: SubscriptionPlanRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
  ) {}

  /**
   * Throws when adding one more member would exceed the caller tenant plan's
   * seat cap. Tenants without an onboarding/plan, or on an unlimited plan
   * (maxUsers null), are unrestricted. Pending invites count toward the cap.
   */
  async ensureSeatAvailable(accessToken: string): Promise<void> {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    const tenantId = actor.tenantId;

    const onboarding =
      await this.onboardingRepository.findByTenantId(tenantId);
    if (!onboarding) {
      return;
    }

    const plan = await this.planRepository.findByCode(
      onboarding.subscription.planCode,
    );
    if (!plan || plan.maxUsers == null) {
      return;
    }

    const [users, pendingInvites] = await Promise.all([
      this.userRepository.findAllByTenant(tenantId),
      this.inviteRepository.listPendingByTenant(tenantId),
    ]);
    const activeUsers = users.filter(
      (user) => (user.accountStatus ?? 'enabled') === 'enabled',
    ).length;
    const usedSeats = activeUsers + pendingInvites.length;

    if (usedSeats >= plan.maxUsers) {
      throw new TenantSeatLimitReachedError(plan.maxUsers);
    }
  }
}
