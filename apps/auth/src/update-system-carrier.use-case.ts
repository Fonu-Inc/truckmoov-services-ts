import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';

type Payload = { name?: string; displayName?: string; active?: boolean };

@Injectable()
export class UpdateSystemCarrierUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly bundleCarrierRepository: BundleCarrierRepository,
  ) {}

  async execute(accessToken: string, carrierId: string, payload: Payload) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const existing = await this.bundleCarrierRepository.findById(carrierId);
    if (!existing) throw new Error('Carrier not found');

    await this.bundleCarrierRepository.save({
      ...existing,
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.displayName !== undefined && { displayName: payload.displayName }),
      ...(payload.active !== undefined && { active: payload.active }),
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: { id: carrierId } };
  }
}
