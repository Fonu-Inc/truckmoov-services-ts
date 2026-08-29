import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { WALLET_LEDGER_REPOSITORY, type WalletLedgerRepository, type CrossTenantLedgerFilters } from './wallet-ledger.repository';
import { buildExport } from './export.helper';

type Filters = CrossTenantLedgerFilters & { format?: 'csv' | 'xlsx' };

const HEADERS = ['Tenant ID', 'Date', 'Direction', 'Category', 'Amount (NGN)', 'Balance After (NGN)', 'Reason', 'Reference'];

@Injectable()
export class ExportCrossTenantLedgerUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  async execute(accessToken: string, filters: Filters = {}) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to export the platform ledger',
    });

    const { format, ...ledgerFilters } = filters;
    const { items } = await this.ledger.listAcrossTenants({ ...ledgerFilters, limit: 10000, page: 1 });

    const rows = items.map((entry) => [
      entry.tenantId,
      entry.createdAt.toISOString(),
      entry.direction,
      entry.category,
      (entry.amountKobo / 100).toFixed(2),
      (entry.balanceAfterKobo / 100).toFixed(2),
      entry.reason,
      entry.reference ?? '',
    ]);

    const { buffer, contentType, ext } = await buildExport(format ?? 'csv', HEADERS, rows, 'Cross-Tenant Ledger');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { buffer, contentType, ext, filename: `cross-tenant-ledger-${timestamp}.${ext}` };
  }
}
