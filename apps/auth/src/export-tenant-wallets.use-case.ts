import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository, type TenantWalletSummaryRow } from './tenant-wallet.repository';
import { walletStatus, type WalletStatus } from './wallet-credit';
import { buildExport } from './export.helper';

type Filters = { query?: string; status?: WalletStatus; format?: 'csv' | 'xlsx' };

const HEADERS = ['Tenant ID', 'Balance (NGN)', 'Status', 'Credit Enabled', 'Credit Limit (NGN)', 'Low Balance Threshold (NGN)', 'Updated At'];

@Injectable()
export class ExportTenantWalletsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
  ) {}

  async execute(accessToken: string, filters: Filters = {}) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to export tenant wallets',
    });

    const wallets = await this.wallets.findAll();
    const rows: TenantWalletSummaryRow[] = wallets.map((wallet) => ({
      ...wallet,
      status: walletStatus(wallet.balanceKobo, wallet),
    }));

    const search = filters.query?.trim().toLowerCase();
    const visible = rows.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (!search) return true;
      return row.tenantId.toLowerCase().includes(search);
    });

    const csvRows = visible.map((row) => [
      row.tenantId,
      (row.balanceKobo / 100).toFixed(2),
      row.status,
      row.creditEnabled ? 'yes' : 'no',
      row.creditLimitKobo == null ? '' : (row.creditLimitKobo / 100).toFixed(2),
      (row.lowBalanceThresholdKobo / 100).toFixed(2),
      row.updatedAt.toISOString(),
    ]);

    const format = filters.format ?? 'csv';
    const { buffer, contentType, ext } = await buildExport(format, HEADERS, csvRows, 'Tenant Wallets');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { buffer, contentType, ext, filename: `tenant-wallets-${timestamp}.${ext}` };
  }
}
