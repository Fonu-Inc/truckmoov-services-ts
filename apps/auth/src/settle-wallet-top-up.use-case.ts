import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from './tenant-wallet.repository';
import {
  WALLET_TOP_UP_REPOSITORY,
  type WalletTopUpRepository,
} from './wallet-top-up.repository';

export type SettleWalletTopUpOutcome =
  | 'credited'
  | 'unknown_reference'
  | 'already_settled';

/**
 * Credits a tenant wallet for a confirmed mobile-money top-up.
 *
 * The wallet is credited only by the caller that wins the pending -> success
 * transition, so a provider replaying the same callback cannot credit twice.
 * The credited tenant is taken from the stored row, never from the callback,
 * so a forged callback cannot direct funds at another tenant.
 */
@Injectable()
export class SettleWalletTopUpUseCase {
  private readonly logger = new Logger(SettleWalletTopUpUseCase.name);

  constructor(
    @Inject(WALLET_TOP_UP_REPOSITORY)
    private readonly walletTopUpRepository: WalletTopUpRepository,
    @Inject(TENANT_WALLET_REPOSITORY)
    private readonly tenantWalletRepository: TenantWalletRepository,
  ) {}

  async execute(
    reference: string,
  ): Promise<{ outcome: SettleWalletTopUpOutcome; tenantId: string | null }> {
    const topUp = await this.walletTopUpRepository.findByReference(reference);
    if (!topUp) return { outcome: 'unknown_reference', tenantId: null };
    if (topUp.status !== 'pending') {
      return { outcome: 'already_settled', tenantId: topUp.tenantId };
    }

    const won = await this.walletTopUpRepository.markSettled(topUp.id, new Date());
    if (!won) return { outcome: 'already_settled', tenantId: topUp.tenantId };

    await this.tenantWalletRepository.credit(topUp.tenantId, topUp.amountKobo, {
      category: 'top_up',
      quantity: 1,
      unitRateKobo: topUp.amountKobo,
      reason: `Wallet top-up via ${topUp.provider}`,
      reference: topUp.reference,
    });
    this.logger.log(
      `wallet_top_up_settled:${topUp.id}:tenant=${topUp.tenantId}:kobo=${topUp.amountKobo}`,
    );
    return { outcome: 'credited', tenantId: topUp.tenantId };
  }
}
