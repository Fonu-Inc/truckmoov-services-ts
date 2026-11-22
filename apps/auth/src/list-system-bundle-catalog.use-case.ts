import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

type Filters = {
  carrierId?: string;
  billingCycle?: string;
  search?: string;
  active?: boolean;
  page?: number;
  limit?: number;
};

const EXPORT_HEADERS = ['Code', 'Name', 'Carrier', 'Data (GB)', 'Validity (Days)', 'Billing Cycle', 'Price (NGN)', 'Status'];

@Injectable()
export class ListSystemBundleCatalogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly carriers: BundleCarrierRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const [{ items, total }, carrierNames] = await Promise.all([this.find(filters), this.carrierNames()]);

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          carrier: b.carrierId,
          carrierName: carrierNames.get(b.carrierId) ?? null,
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

  /** Every bundle the filters match, not one page, in the file the table's Export Data button downloads. */
  async export(accessToken: string, filters: Omit<Filters, 'page' | 'limit'> & { format?: 'csv' | 'xlsx' } = {}) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const [{ items }, carrierNames] = await Promise.all([this.find({ ...filters, limit: 100_000 }), this.carrierNames()]);
    const rows = items.map((b) => [
      b.code,
      b.name,
      carrierNames.get(b.carrierId) ?? b.carrierId,
      b.dataAmountGb,
      b.validityDays,
      b.billingCycle,
      (b.priceKobo / 100).toFixed(2),
      b.active ? 'Active' : 'Inactive',
    ]);
    const { buffer, contentType, ext } = await buildExport(filters.format ?? 'csv', EXPORT_HEADERS, rows, 'Bundle Catalog');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return { buffer, contentType, ext, filename: `bundle-catalog-${timestamp}.${ext}` };
  }

  private find(filters?: Filters) {
    return this.bundleCatalogRepository.findAll({
      carrierId: filters?.carrierId,
      billingCycle: filters?.billingCycle,
      search: filters?.search,
      active: filters?.active,
      page: filters?.page,
      limit: filters?.limit,
    });
  }

  private async carrierNames(): Promise<Map<string, string>> {
    return new Map((await this.carriers.findAll()).map((carrier) => [carrier.id, carrier.displayName]));
  }
}
