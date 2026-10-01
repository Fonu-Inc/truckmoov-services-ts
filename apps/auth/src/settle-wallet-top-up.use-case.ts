import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaidAmount } from './contexts/payments';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from './tenant-wallet.repository';
import {
  WALLET_TOP_UP_REPOSITORY,
  type StoredWalletTopUp,
  type WalletTopUpRepository,
} from './wallet-top-up.repository';

export type SettleWalletTopUpOutcome =
  | 'credited'
  | 'not_found'
  | 'already_settled'
  | 'amount_mismatch';

type SettleResult = { outcome: SettleWalletTopUpOutcome; tenantId: string | null };

/**
 * Credits a tenant wallet for a confirmed top-up.
 *
 * The credit is written first under a key derived from the reference, then the
 * top-up is marked settled, so a crash between the two is repaired by the
 * provider's retry without crediting twice. The credited tenant is taken from
 * the stored row, never from the callback.
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

  async execute(reference: string, paid?: PaidAmount): Promise<SettleResult> {
    const topUp = await this.walletTopUpRepository.findByReference(reference);
    if (!topUp) return { outcome: 'not_found', tenantId: null };
    if (topUp.status !== 'pending') {
      return { outcome: 'already_settled', tenantId: topUp.tenantId };
    }
    if (!this.matchesPaid(topUp.amountKobo, paid)) {
      this.logger.warn(
        `wallet_top_up_amount_mismatch:${topUp.id}:expected=${topUp.amountKobo}:paid=${paid?.amountKobo ?? 'none'}:currency=${paid?.currency ?? 'none'}`,
      );
      return { outcome: 'amount_mismatch', tenantId: topUp.tenantId };
    }

    await this.credit(topUp);
    const won = await this.walletTopUpRepository.markSettled(topUp.id, new Date());
    if (!won) return { outcome: 'already_settled', tenantId: topUp.tenantId };

    this.logger.log(
      `wallet_top_up_settled:${topUp.id}:tenant=${topUp.tenantId}:kobo=${topUp.amountKobo}`,
    );
    return { outcome: 'credited', tenantId: topUp.tenantId };
  }

  private matchesPaid(expectedKobo: number, paid?: PaidAmount): boolean {
    return paid?.amountKobo === expectedKobo && paid.currency?.toUpperCase() === 'NGN';
  }

  private async credit(topUp: StoredWalletTopUp): Promise<void> {
    await this.tenantWalletRepository.ensure(topUp.tenantId);
    const result = await this.tenantWalletRepository.credit(topUp.tenantId, topUp.amountKobo, {
      category: 'top_up',
      quantity: 1,
      unitRateKobo: topUp.amountKobo,
      reason: `Wallet top-up via ${topUp.provider}`,
      reference: topUp.reference,
      idempotencyKey: `topup:${topUp.reference}`,
    });
    if (!result.ok) {
      throw new Error(`Wallet top-up ${topUp.reference} could not be credited`);
    }
  }
}
