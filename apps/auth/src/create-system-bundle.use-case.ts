import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { MTN_CARRIER_ID } from './contexts/mtn/mtn-bundle-catalog.mapper';

type Payload = {
  id?: string;
  code: string;
  name: string;
  carrierId?: string;
  dataAmountGb: number;
  validityDays: number;
  billingCycle: string;
  priceNaira: number;
  currency?: string;
  active?: boolean;
};

export class BundleCodeTakenError extends Error {
  constructor(code: string) {
    super(`A bundle with code ${code} already exists`);
  }
}

@Injectable()
export class CreateSystemBundleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const id = payload.id ?? payload.code;
    // save() is an upsert, so a taken id or code would silently overwrite that bundle.
    const sameCode = await this.bundleCatalogRepository.findAll({ search: payload.code, limit: 100 });
    if ((await this.bundleCatalogRepository.findById(id)) || sameCode.items.some((b) => b.code === payload.code)) {
      throw new BundleCodeTakenError(payload.code);
    }

    const now = new Date();
    await this.bundleCatalogRepository.save({
      id,
      code: payload.code,
      name: payload.name,
      carrierId: payload.carrierId ?? MTN_CARRIER_ID,
      dataAmountGb: payload.dataAmountGb,
      validityDays: payload.validityDays,
      billingCycle: payload.billingCycle,
      priceKobo: Math.round(payload.priceNaira * 100),
      currency: payload.currency ?? 'NGN',
      active: payload.active ?? true,
      createdAt: now,
      updatedAt: now,
    });

    return { status: true, message: 'success', data: { id } };
  }
}
