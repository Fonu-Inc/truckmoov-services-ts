import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { analyticsWindow, type AnalyticsRange } from './analytics-range';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';
import { BUNDLE_CATALOG_REPOSITORY, findBundlesByIds, type BundleCatalogRepository } from './bundle-catalog.repository';

@Injectable()
export class GetSpendBreakdownUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, range: AnalyticsRange, startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access spend breakdown');

    const { start, end } = analyticsWindow(range, startDate, endDate);
    const rows = await this.bundleTransactionRepository.sumByBundle(actor.tenantId!, start, end);

    const totalKobo = rows.reduce((sum, r) => sum + r.amountKobo, 0);
    const bundles = await findBundlesByIds(this.bundleCatalogRepository, rows.map((r) => r.bundleId));

    const breakdown = rows.map((r) => ({
      bundleId: r.bundleId,
      bundleName: bundles.get(r.bundleId)?.name ?? '',
      bundleCode: bundles.get(r.bundleId)?.code ?? '',
      amount: r.amountKobo / 100,
      percentage: totalKobo > 0 ? Math.round((r.amountKobo / totalKobo) * 1000) / 10 : 0,
    }));

    return {
      status: true,
      message: 'success',
      data: { breakdown },
    };
  }
}
