import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_CATALOG_REPOSITORY, findBundlesByIds, type BundleCatalogRepository } from './bundle-catalog.repository';
import { analyticsWindow, type AnalyticsRange } from './analytics-range';

@Injectable()
export class GetSubscriptionUsageUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, range: AnalyticsRange = '30d', startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access subscription usage');

    const rows = await this.bundleAllocationRepository.sumDataUsedByBundle(
      actor.tenantId!,
      analyticsWindow(range, startDate, endDate),
    );
    const bundles = await findBundlesByIds(this.bundleCatalogRepository, rows.map((r) => r.bundleId));

    return {
      status: true,
      message: 'success',
      data: {
        usage: rows.map((r) => ({
          bundleId: r.bundleId,
          bundleCode: bundles.get(r.bundleId)?.code ?? r.bundleId,
          usedMb: r.usedMb,
          totalMb: r.totalMb,
        })),
      },
    };
  }
}
