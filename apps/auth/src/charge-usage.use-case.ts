import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import type { UsageItem } from './plan-entitlements';
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
  /** The tenant's plan, which decides how much monthly allowance applies. */
  planCode?: string;
};

export type ChargeResult = {
  charged: boolean;
  totalKobo: number;
  unitRateKobo: number;
  balanceAfterKobo: number | null;
  /** Units the plan's monthly allowance covered, which cost nothing. */
  coveredByAllowance: number;
  /** Units charged to the wallet, being everything past the allowance. */
  chargedUnits: number;
};

/**
 * The usage item a channel draws its monthly allowance from. A plan that
 * includes 1,000 messages covers SMS and WhatsApp from the same pool, because
 * the plan sells "messages" rather than one allowance per channel.
 */
const CHANNEL_USAGE_ITEM: Record<CommunicationChannel, UsageItem> = {
  sms: 'messages',
  whatsapp: 'messages',
  voice: 'call_minutes',
  ai: 'ai_requests',
  iot_sim: 'sim_connectivity',
};

/** The month an allowance belongs to. UTC, so a boundary is unambiguous. */
export function allowanceMonth(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

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
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly planEntitlements: PlanEntitlementsRepository,
  ) {}

  async execute(command: ChargeUsageCommand): Promise<ChargeResult> {
    // Throws when the channel is disabled or has no rate, which is the refusal
    // path for a switched-off channel: no rate, no send.
    const priced = await this.rates.price(
      command.channel,
      command.quantity,
      command.occurredAt ?? new Date(),
    );

    // The plan's included allowance is consumed first, and only what it does
    // not cover reaches the wallet. A plan selling 1,000 messages means the
    // first thousand are already paid for in the subscription.
    const covered = await this.consumeAllowance(command, priced.quantity);
    const chargeable = priced.quantity - covered;

    if (chargeable <= 0) {
      return {
        charged: false,
        totalKobo: 0,
        unitRateKobo: priced.unitRateKobo,
        balanceAfterKobo: null,
        coveredByAllowance: covered,
        chargedUnits: 0,
      };
    }

    const totalKobo = priced.unitRateKobo * chargeable;

    // Checked before the debit, so a refused spend leaves the balance alone.
    // This is what extends the spending limit past data bundles to every
    // channel, which was the gap.
    await this.spendingLimit.assertWithinLimit(command.tenantId, totalKobo);

    const debited = await this.wallet.debit(command.tenantId, totalKobo, {
      category: CHANNEL_CATEGORY[command.channel],
      quantity: chargeable,
      // The rate at the moment of use, copied onto the line. A later repricing
      // cannot change what this charge was.
      unitRateKobo: priced.unitRateKobo,
      reason: command.reason,
      reference: command.reference,
    });

    if (!debited.ok) {
      this.logger.warn(`usage_charge_refused:${command.tenantId}:${command.channel}`);
      throw new InsufficientWalletBalanceError(totalKobo);
    }

    return {
      charged: true,
      totalKobo,
      unitRateKobo: priced.unitRateKobo,
      balanceAfterKobo: debited.balanceAfterKobo ?? null,
      coveredByAllowance: covered,
      chargedUnits: chargeable,
    };
  }

  /**
   * How much of this usage the plan already covers.
   *
   * A tenant with no plan entitlements configured gets no allowance rather than
   * an error: the charge still works, it is simply all billable.
   */
  private async consumeAllowance(command: ChargeUsageCommand, quantity: number): Promise<number> {
    if (!command.planCode) return 0;

    const item = CHANNEL_USAGE_ITEM[command.channel];
    try {
      const included = await this.entitlements.monthlyAllowance(command.planCode, item);
      if (included <= 0) return 0;

      const month = allowanceMonth(command.occurredAt ?? new Date());
      const result = await this.planEntitlements.consumeAllowance(
        command.tenantId,
        item,
        month,
        quantity,
        included,
      );
      return result.covered;
    } catch {
      // No entitlements for this plan. Charging everything is the safe
      // fallback: giving away free units on a lookup failure is not.
      return 0;
    }
  }
}
