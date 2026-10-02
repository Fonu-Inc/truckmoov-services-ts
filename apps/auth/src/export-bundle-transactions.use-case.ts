import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

type Filters = { search?: string; carriers?: string[]; status?: string; startDate?: string; endDate?: string; format?: 'csv' | 'xlsx' };

const HEADERS = ['ID', 'Date', 'Mobile Number', 'Bundle ID', 'Amount (NGN)', 'Status', 'Reference'];

@Injectable()
export class ExportBundleTransactionsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot export tenant transactions');

    const { items } = await this.bundleTransactionRepository.findAll({
      tenantId: actor.tenantId!,
      search: filters?.search,
      status: filters?.status,
      bundleIds: await this.bundleIdsForCarriers(filters?.carriers),
      startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
      limit: 10000,
    });

    const rows = items.map((t) => [
      t.id,
      t.createdAt.toISOString(),
      t.mobileNumber,
      t.bundleId,
      (t.amountKobo / 100).toFixed(2),
      t.status,
      t.paymentReference ?? '',
    ]);

    const format = filters?.format ?? 'csv';
    const { buffer, contentType, ext } = await buildExport(format, HEADERS, rows, 'Bundle Transactions');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { buffer, contentType, ext, filename: `bundle-transactions-${timestamp}.${ext}` };
  }

  private async bundleIdsForCarriers(carriers?: string[]): Promise<string[] | undefined> {
    if (!carriers?.length) return undefined;
    const { items } = await this.bundleCatalogRepository.findAll({ carrierIds: carriers, limit: 10000 });
    return items.map((b) => b.id);
  }
}
