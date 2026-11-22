import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_ALLOCATION_REPOSITORY, effectiveAllocationStatus, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';

export class BundleAllocationNotFoundError extends Error {
  constructor() {
    super('Allocation not found');
  }
}

@Injectable()
export class GetBundleAllocationUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, allocationId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access tenant allocations');

    const alloc = await this.bundleAllocationRepository.findById(allocationId);
    if (!alloc || alloc.tenantId !== actor.tenantId) throw new BundleAllocationNotFoundError();

    const b = await this.bundleCatalogRepository.findById(alloc.bundleId);
    const now = Date.now();

    return {
      status: true,
      message: 'success',
      data: {
        id: alloc.id,
        mobileNumber: alloc.mobileNumber,
        bundle: b
          ? { id: b.id, code: b.code, name: b.name, carrier: b.carrierId, dataAmountGb: b.dataAmountGb, billingCycle: b.billingCycle, price: b.priceKobo / 100 }
          : null,
        dataUsedMb: alloc.dataUsedMb,
        dataTotalMb: alloc.dataTotalMb,
        dataUsedGb: alloc.dataUsedMb / 1024,
        dataTotalGb: alloc.dataTotalMb / 1024,
        dataRemainingMb: Math.max(0, alloc.dataTotalMb - alloc.dataUsedMb),
        dataRemainingGb: Math.max(0, (alloc.dataTotalMb - alloc.dataUsedMb) / 1024),
        usagePercentage: alloc.dataTotalMb > 0 ? Math.round((alloc.dataUsedMb / alloc.dataTotalMb) * 100 * 10) / 10 : 0,
        activatedAt: alloc.activatedAt?.toISOString() ?? null,
        expiresAt: alloc.expiresAt?.toISOString() ?? null,
        daysLeft: Math.max(0, Math.ceil((alloc.expiresAt ? alloc.expiresAt.getTime() - now : 0) / 86400000)),
        status: effectiveAllocationStatus(alloc),
      },
    };
  }
}
