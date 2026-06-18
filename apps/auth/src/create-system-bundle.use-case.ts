import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';

type Payload = {
  id: string;
  code: string;
  name: string;
  carrierId: string;
  dataAmountGb: number;
  validityDays: number;
  billingCycle: string;
  priceNaira: number;
  currency?: string;
};

@Injectable()
export class CreateSystemBundleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const now = new Date();
    await this.bundleCatalogRepository.save({
      id: payload.id,
      code: payload.code,
      name: payload.name,
      carrierId: payload.carrierId,
      dataAmountGb: payload.dataAmountGb,
      validityDays: payload.validityDays,
      billingCycle: payload.billingCycle,
      priceKobo: Math.round(payload.priceNaira * 100),
      currency: payload.currency ?? 'NGN',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    return { status: true, message: 'success', data: { id: payload.id } };
  }
}
