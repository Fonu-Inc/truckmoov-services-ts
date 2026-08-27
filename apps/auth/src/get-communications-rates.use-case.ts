import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { CommunicationRateService } from './communication-rate.service';

/**
 * Read-only rates for a tenant. `CommunicationRatesController` guards the same
 * data behind a platform-admin check because it also writes; a tenant needs to
 * see what they are charged per channel, never to change it.
 */
@Injectable()
export class GetCommunicationsRatesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(CommunicationRateService) private readonly rates: CommunicationRateService,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors do not hold a wallet');

    return { status: true, message: 'success', data: await this.rates.currentRates() };
  }
}
