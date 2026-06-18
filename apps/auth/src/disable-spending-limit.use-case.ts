import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SPENDING_LIMIT_REPOSITORY, type SpendingLimitRepository } from './spending-limit.repository';

@Injectable()
export class DisableSpendingLimitUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SPENDING_LIMIT_REPOSITORY) private readonly spendingLimitRepository: SpendingLimitRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot disable spending limits');

    const existing = await this.spendingLimitRepository.findByTenantId(actor.tenantId!);
    if (existing) {
      await this.spendingLimitRepository.save({ ...existing, enabled: false, updatedAt: new Date() });
    }

    return { status: true, message: 'success', data: { enabled: false } };
  }
}
