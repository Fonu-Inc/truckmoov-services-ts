import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';

type Range = '7d' | '30d' | '90d' | 'custom';

function computeDateRange(range: Range, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const end = new Date();
  if (range === 'custom') {
    return { start: new Date(startDate!), end: endDate ? new Date(endDate) : end };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

@Injectable()
export class GetCarrierDistributionUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, range: Range, startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access carrier distribution');

    const { start, end } = computeDateRange(range, startDate, endDate);
    const tenantId = actor.tenantId!;

    const byBundle = await this.bundleTransactionRepository.sumByBundle(tenantId, start, end);

    const bundleIds = [...new Set(byBundle.map((r) => r.bundleId))];
    const bundleLookup = new Map<string, string>();
    await Promise.all(
      bundleIds.map(async (id) => {
        const b = await this.bundleCatalogRepository.findById(id);
        if (b) bundleLookup.set(id, b.carrierId);
      }),
    );

    const bundles = byBundle.map((r) => ({ id: r.bundleId, carrierId: bundleLookup.get(r.bundleId) ?? 'unknown' }));
    const byCarrier = await this.bundleTransactionRepository.sumByCarrier(tenantId, start, end, bundles);

    const totalKobo = byCarrier.reduce((sum, r) => sum + r.amountKobo, 0);

    return {
      status: true,
      message: 'success',
      data: {
        distribution: byCarrier.map((r) => ({
          carrierId: r.carrierId,
          amount: r.amountKobo / 100,
          percentage: totalKobo > 0 ? Math.round((r.amountKobo / totalKobo) * 1000) / 10 : 0,
        })),
      },
    };
  }
}
