import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';

@Injectable()
export class ListCarriersUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly bundleCarrierRepository: BundleCarrierRepository,
  ) {}

  async execute(accessToken: string, activeOnly = true) {
    await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    const items = await this.bundleCarrierRepository.findAll(activeOnly);

    return {
      status: true,
      message: 'success',
      data: {
        carriers: items.map((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName,
          active: c.active,
        })),
      },
    };
  }
}
