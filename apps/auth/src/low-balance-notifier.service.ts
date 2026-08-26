import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from './tenant-wallet.repository';
import { walletStatus } from './wallet-credit';

/**
 * Warns a tenant the moment their wallet crosses below its own threshold.
 *
 * Raised on the crossing rather than on every charge: a wallet that is already
 * low would otherwise send a warning for every message sent, which is how a
 * warning stops being read.
 *
 * This is not auto top-up. No payment authorisation is stored for any tenant,
 * so nothing here can charge a card — it can only tell someone to.
 */
@Injectable()
export class LowBalanceNotifierService {
  private readonly logger = new Logger(LowBalanceNotifierService.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallets: TenantWalletRepository,
  ) {}

  async afterDebit(tenantId: string, balanceBeforeKobo: number | null, balanceAfterKobo: number | null): Promise<void> {
    if (balanceBeforeKobo === null || balanceAfterKobo === null) return;

    try {
      const wallet = await this.wallets.findByTenantId(tenantId);
      if (!wallet) return;

      const before = walletStatus(balanceBeforeKobo, wallet);
      const after = walletStatus(balanceAfterKobo, wallet);
      if (before === after) return;
      if (after === 'healthy') return;

      await this.bus.publish(`tm.${tenantId}.wallet.balance.${after}`, {
        id: crypto.randomUUID(),
        type: `wallet.balance.${after}`,
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        data: {
          balance_kobo: balanceAfterKobo,
          threshold_kobo: wallet.lowBalanceThresholdKobo,
          credit_enabled: wallet.creditEnabled,
          credit_limit_kobo: wallet.creditLimitKobo,
        },
      });

      this.logger.warn(`wallet_${after}:${tenantId}:${balanceAfterKobo}`);
    } catch (error) {
      // A warning that cannot be sent must not fail the charge that triggered
      // it. The money already moved.
      this.logger.warn(
        `low_balance_notify_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
