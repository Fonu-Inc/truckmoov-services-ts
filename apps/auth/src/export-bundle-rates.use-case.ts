import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

type Filters = { search?: string; carriers?: string[]; planType?: string; format?: 'csv' | 'xlsx' };

const HEADERS = ['ID', 'Code', 'Name', 'Carrier', 'Data (GB)', 'Validity (Days)', 'Billing Cycle', 'Price (NGN)', 'Active'];

@Injectable()
export class ExportBundleRatesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    const { items: allItems } = await this.bundleCatalogRepository.findAll({
      search: filters?.search,
      billingCycle: filters?.planType,
      activeOnly: true,
      limit: 10000,
    });

    const items = filters?.carriers?.length
      ? allItems.filter((b) => filters.carriers!.includes(b.carrierId))
      : allItems;

    const rows = items.map((b) => [
      b.id,
      b.code,
      b.name,
      b.carrierId,
      b.dataAmountGb,
      b.validityDays,
      b.billingCycle,
      (b.priceKobo / 100).toFixed(2),
      b.active ? 'Yes' : 'No',
    ]);

    const format = filters?.format ?? 'csv';
    const { buffer, contentType, ext } = await buildExport(format, HEADERS, rows, 'Bundle Rates');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { buffer, contentType, ext, filename: `bundle-rates-${timestamp}.${ext}` };
  }
}
