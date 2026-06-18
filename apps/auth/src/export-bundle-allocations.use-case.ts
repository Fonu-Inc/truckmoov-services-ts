import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository, type StoredBundleCatalog } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

type Filters = { search?: string; status?: string; billingCycles?: string[]; format?: 'csv' | 'xlsx' };

const HEADERS = ['ID', 'Mobile Number', 'Bundle', 'Carrier', 'Data (GB)', 'Used (GB)', 'Status', 'Activated', 'Expires', 'Days Left'];

@Injectable()
export class ExportBundleAllocationsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot export tenant allocations');

    const { items } = await this.bundleAllocationRepository.findAll({
      tenantId: actor.tenantId!,
      search: filters?.search,
      status: filters?.status,
      billingCycles: filters?.billingCycles,
      limit: 10000,
    });

    const bundleCache = new Map<string, StoredBundleCatalog | null>();
    for (const alloc of items) {
      if (!bundleCache.has(alloc.bundleId)) {
        bundleCache.set(alloc.bundleId, await this.bundleCatalogRepository.findById(alloc.bundleId));
      }
    }

    const now = Date.now();
    const rows = items.map((alloc) => {
      const b = bundleCache.get(alloc.bundleId) ?? null;
      const daysLeft = Math.max(0, Math.ceil((alloc.expiresAt ? alloc.expiresAt.getTime() - now : 0) / 86400000));
      return [
        alloc.id,
        alloc.mobileNumber,
        b?.name ?? alloc.bundleId,
        b?.carrierId ?? '',
        b?.dataAmountGb ?? '',
        (alloc.dataUsedMb / 1024).toFixed(2),
        alloc.status,
        alloc.activatedAt?.toISOString() ?? '',
        alloc.expiresAt?.toISOString() ?? '',
        daysLeft,
      ];
    });

    const format = filters?.format ?? 'csv';
    const { buffer, contentType, ext } = await buildExport(format, HEADERS, rows, 'Bundle Allocations');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { buffer, contentType, ext, filename: `bundle-allocations-${timestamp}.${ext}` };
  }
}
