import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';

type Filters = {
  carrierId?: string;
  billingCycle?: string;
  search?: string;
  active?: boolean;
  page?: number;
  limit?: number;
};

@Injectable()
export class ListSystemBundleCatalogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const { items, total } = await this.bundleCatalogRepository.findAll({
      carrierId: filters?.carrierId,
      billingCycle: filters?.billingCycle,
      search: filters?.search,
      active: filters?.active,
      page: filters?.page,
      limit: filters?.limit,
    });

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          carrier: b.carrierId,
          dataAmountGb: b.dataAmountGb,
          validityDays: b.validityDays,
          billingCycle: b.billingCycle,
          price: b.priceKobo / 100,
          currency: b.currency,
          active: b.active,
        })),
        total,
      },
    };
  }
}
