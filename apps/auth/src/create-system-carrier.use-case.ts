import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';

type Payload = { id: string; name: string; displayName: string };

@Injectable()
export class CreateSystemCarrierUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly bundleCarrierRepository: BundleCarrierRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const now = new Date();
    await this.bundleCarrierRepository.save({
      id: payload.id,
      name: payload.name,
      displayName: payload.displayName,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    return { status: true, message: 'success', data: { id: payload.id } };
  }
}
