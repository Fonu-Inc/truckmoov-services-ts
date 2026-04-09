import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SYSTEM_SUBSCRIPTION_PLANS } from './system-subscription-plans';

const SYSTEM_TENANT_ID = 'system';
const SYSTEM_VIEWER_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

@Injectable()
export class GetSystemSubscriptionPlansUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (
      actor.tenantId !== SYSTEM_TENANT_ID ||
      !SYSTEM_VIEWER_ROLES.has(actor.role)
    ) {
      throw new ForbiddenError(
        'You are not permitted to view subscription plans',
      );
    }

    return {
      status: true,
      message: 'success',
      data: {
        plans: SYSTEM_SUBSCRIPTION_PLANS.map((plan) => ({
          ...plan,
          features: [...plan.features],
        })),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
