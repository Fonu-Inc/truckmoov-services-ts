import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';

type Payload = {
  name?: string;
  dataAmountGb?: number;
  validityDays?: number;
  billingCycle?: string;
  priceNaira?: number;
  active?: boolean;
};

export class BundleNotFoundError extends Error {
  constructor() {
    super('Bundle not found');
  }
}

@Injectable()
export class UpdateSystemBundleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, bundleId: string, payload: Payload) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const existing = await this.bundleCatalogRepository.findById(bundleId);
    if (!existing) throw new BundleNotFoundError();

    await this.bundleCatalogRepository.save({
      ...existing,
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.dataAmountGb !== undefined && { dataAmountGb: payload.dataAmountGb }),
      ...(payload.validityDays !== undefined && { validityDays: payload.validityDays }),
      ...(payload.billingCycle !== undefined && { billingCycle: payload.billingCycle }),
      ...(payload.priceNaira !== undefined && { priceKobo: Math.round(payload.priceNaira * 100) }),
      ...(payload.active !== undefined && { active: payload.active }),
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: { id: bundleId } };
  }
}
