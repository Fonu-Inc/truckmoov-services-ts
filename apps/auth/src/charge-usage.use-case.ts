import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommunicationRateService } from './communication-rate.service';
import type { CommunicationChannel } from './communication-rates.repository';
import { SpendingLimitService } from './spending-limit.service';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from './tenant-wallet.repository';
import type { WalletLedgerCategory } from './wallet-ledger.repository';

export class InsufficientWalletBalanceError extends Error {
  constructor(requiredKobo: number) {
    super(`Wallet balance does not cover ${requiredKobo / 100}`);
  }
}

/**
 * One wallet funds every channel, so the ledger category is what separates
 * communications spend from data-bundle spend on a screen. The channel maps
 * onto it directly rather than being stored twice.
 */
const CHANNEL_CATEGORY: Record<CommunicationChannel, WalletLedgerCategory> = {
  sms: 'sms',
  whatsapp: 'whatsapp',
  voice: 'voice',
  ai: 'ai',
  iot_sim: 'sim_provisioning',
};

export type ChargeUsageCommand = {
  tenantId: string;
  channel: CommunicationChannel;
  /** Messages, minutes, or active SIMs, depending on the channel's unit. */
  quantity: number;
  reason: string;
  /** Ties the charge to the thing that caused it — a message id, a call id. */
  reference: string;
  /** When the usage happened. Priced at the rate live then, not the rate now. */
  occurredAt?: Date;
};

export type ChargeResult = {
  charged: boolean;
  totalKobo: number;
  unitRateKobo: number;
  balanceAfterKobo: number | null;
};

/**
 * Charges a tenant for usage, before the usage happens.
 *
 * The wallet is prepaid, so the charge has to be able to refuse. Charging after
 * a message is sent cannot refuse anything: the money is already spent and the
 * tenant overspends by whatever was in flight. Callers must treat a refusal as
 * "do not send".
 */
@Injectable()
export class ChargeUsageUseCase {
  private readonly logger = new Logger(ChargeUsageUseCase.name);

  constructor(
    @Inject(CommunicationRateService) private readonly rates: CommunicationRateService,
    @Inject(SpendingLimitService) private readonly spendingLimit: SpendingLimitService,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallet: TenantWalletRepository,
  ) {}

  async execute(command: ChargeUsageCommand): Promise<ChargeResult> {
    // Throws when the channel is disabled or has no rate, which is the refusal
    // path for a switched-off channel: no rate, no send.
    const priced = await this.rates.price(
      command.channel,
      command.quantity,
      command.occurredAt ?? new Date(),
    );

    if (priced.totalKobo === 0) {
      return { charged: false, totalKobo: 0, unitRateKobo: priced.unitRateKobo, balanceAfterKobo: null };
    }

    // Checked before the debit, so a refused spend leaves the balance alone.
    // This is what extends the spending limit past data bundles to every
    // channel, which was the gap.
    await this.spendingLimit.assertWithinLimit(command.tenantId, priced.totalKobo);

    const debited = await this.wallet.debit(command.tenantId, priced.totalKobo, {
      category: CHANNEL_CATEGORY[command.channel],
      quantity: priced.quantity,
      // The rate at the moment of use, copied onto the line. A later repricing
      // cannot change what this charge was.
      unitRateKobo: priced.unitRateKobo,
      reason: command.reason,
      reference: command.reference,
    });

    if (!debited.ok) {
      this.logger.warn(`usage_charge_refused:${command.tenantId}:${command.channel}`);
      throw new InsufficientWalletBalanceError(priced.totalKobo);
    }

    return {
      charged: true,
      totalKobo: priced.totalKobo,
      unitRateKobo: priced.unitRateKobo,
      balanceAfterKobo: debited.balanceAfterKobo ?? null,
    };
  }
}
