import { Inject, Injectable, Logger } from '@nestjs/common';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import { EntitlementService } from './entitlement.service';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import type { UsageItem } from './plan-entitlements';
import { CommunicationRateService } from './communication-rate.service';
import type { CommunicationChannel } from './communication-rates.repository';
import { SpendingLimitService } from './spending-limit.service';
import { LowBalanceNotifierService } from './low-balance-notifier.service';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
  type WalletMovementResult,
} from './tenant-wallet.repository';
import {
  WALLET_LEDGER_REPOSITORY,
  type StoredWalletLedgerEntry,
  type WalletLedgerCategory,
  type WalletLedgerDraft,
  type WalletLedgerRepository,
} from './wallet-ledger.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class ChargeReferenceRequiredError extends Error {
  constructor() {
    super('A charge needs a non-empty reference');
  }
}

export class InsufficientWalletBalanceError extends Error {
  constructor(readonly requiredKobo: number) {
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
  /** The tenant's plan, which decides how much monthly allowance applies. Looked up when omitted. */
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
  /** True when the idempotency key was already billed and nothing moved. */
  replayed?: boolean;
};

type AllowanceClaim = { covered: number; restore: () => Promise<void> };

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

/** The month an allowance belongs to, on the Lagos calendar the tenant is billed on. */
export function allowanceMonth(at: Date): string {
  return lagosDate(at).slice(0, 7);
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
    @Inject(LowBalanceNotifierService) private readonly lowBalance: LowBalanceNotifierService,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallet: TenantWalletRepository,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly planEntitlements: PlanEntitlementsRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY) private readonly onboarding: TenantOnboardingRepository,
  ) {}

  async execute(command: ChargeUsageCommand): Promise<ChargeResult> {
    const reference = command.reference?.trim();
    if (!reference) throw new ChargeReferenceRequiredError();

    const idempotencyKey = `usage:${reference}`;
    const original = await this.ledger.findByIdempotencyKey(command.tenantId, idempotencyKey);
    if (original) return this.replayOf(original, command.quantity);

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
    const allowance = await this.consumeAllowance(command, priced.quantity);
    const chargeable = priced.quantity - allowance.covered;

    if (chargeable <= 0) {
      return this.recordAllowanceCover(command, allowance, priced, reference, idempotencyKey);
    }

    const totalKobo = priced.unitRateKobo * chargeable;
    const debited = await this.debitOrRestore(command, allowance, {
      category: CHANNEL_CATEGORY[command.channel],
      quantity: chargeable,
      // The rate at the moment of use, copied onto the line. A later repricing
      // cannot change what this charge was.
      unitRateKobo: priced.unitRateKobo,
      reason: command.reason,
      reference,
      idempotencyKey,
    }, totalKobo);

    if (debited.replayed && debited.entry) {
      await allowance.restore();
      return this.replayOf(debited.entry, command.quantity);
    }
    await this.recordSpend(command.tenantId, totalKobo);

    return {
      charged: true,
      totalKobo,
      unitRateKobo: priced.unitRateKobo,
      balanceAfterKobo: debited.balanceAfterKobo ?? null,
      coveredByAllowance: allowance.covered,
      chargedUnits: chargeable,
      replayed: false,
    };
  }

  /**
   * A zero-amount ledger entry under the usage key, so a redelivery finds the
   * charge already settled and does not consume the allowance a second time.
   */
  private async recordAllowanceCover(
    command: ChargeUsageCommand,
    allowance: AllowanceClaim,
    priced: { unitRateKobo: number },
    reference: string,
    idempotencyKey: string,
  ): Promise<ChargeResult> {
    try {
      await this.wallet.ensure(command.tenantId);
      const marker = await this.wallet.debit(command.tenantId, 0, {
        category: CHANNEL_CATEGORY[command.channel],
        quantity: allowance.covered,
        unitRateKobo: 0,
        reason: command.reason,
        reference,
        idempotencyKey,
      });
      if (!marker.ok) throw new InsufficientWalletBalanceError(0);
      if (marker.replayed && marker.entry) {
        await allowance.restore();
        return this.replayOf(marker.entry, command.quantity);
      }
    } catch (error) {
      await allowance.restore();
      throw error;
    }
    return {
      charged: false,
      totalKobo: 0,
      unitRateKobo: priced.unitRateKobo,
      balanceAfterKobo: null,
      coveredByAllowance: allowance.covered,
      chargedUnits: 0,
      replayed: false,
    };
  }

  private replayOf(original: StoredWalletLedgerEntry, quantity: number): ChargeResult {
    if (original.amountKobo === 0) {
      return {
        charged: false,
        totalKobo: 0,
        unitRateKobo: original.unitRateKobo,
        balanceAfterKobo: null,
        coveredByAllowance: original.quantity,
        chargedUnits: 0,
        replayed: true,
      };
    }
    return {
      charged: true,
      totalKobo: original.amountKobo,
      unitRateKobo: original.unitRateKobo,
      balanceAfterKobo: original.balanceAfterKobo,
      coveredByAllowance: Math.max(0, quantity - original.quantity),
      chargedUnits: original.quantity,
      replayed: true,
    };
  }

  /** The debit already happened, so a failed counter update is logged rather than failing the charge. */
  private async recordSpend(tenantId: string, amountKobo: number): Promise<void> {
    try {
      await this.spendingLimit.recordSpend(tenantId, amountKobo);
    } catch (error) {
      this.logger.error(`spending_record_failed:${tenantId}:${(error as Error).message}`);
    }
  }

  /**
   * The limit check and the debit, with the allowance given back when either
   * refuses. Without that, a tenant who cannot pay loses allowance for a send
   * that never happens.
   */
  private async debitOrRestore(
    command: ChargeUsageCommand,
    allowance: AllowanceClaim,
    draft: WalletLedgerDraft,
    totalKobo: number,
  ): Promise<WalletMovementResult> {
    try {
      // Checked before the debit, so a refused spend leaves the balance alone.
      await this.spendingLimit.assertWithinLimit(command.tenantId, totalKobo);

      const before = await this.wallet.findByTenantId(command.tenantId);
      const debited = await this.wallet.debit(command.tenantId, totalKobo, draft);
      if (!debited.ok) {
        this.logger.warn(`usage_charge_refused:${command.tenantId}:${command.channel}`);
        throw new InsufficientWalletBalanceError(totalKobo);
      }
      if (!debited.replayed) {
        await this.lowBalance.afterDebit(
          command.tenantId,
          before?.balanceKobo ?? null,
          debited.balanceAfterKobo,
        );
      }
      return debited;
    } catch (error) {
      await allowance.restore();
      throw error;
    }
  }

  /**
   * How much of this usage the plan already covers.
   *
   * A tenant with no plan entitlements configured gets no allowance rather than
   * an error: the charge still works, it is simply all billable.
   */
  private async consumeAllowance(
    command: ChargeUsageCommand,
    quantity: number,
  ): Promise<AllowanceClaim> {
    const none: AllowanceClaim = { covered: 0, restore: async () => {} };
    const item = CHANNEL_USAGE_ITEM[command.channel];
    try {
      const planCode =
        command.planCode ?? (await this.onboarding.findByTenantId(command.tenantId))?.subscription?.planCode;
      if (!planCode) return none;
      const included = await this.entitlements.monthlyAllowance(planCode, item);
      if (included <= 0) return none;

      const month = allowanceMonth(command.occurredAt ?? new Date());
      const result = await this.planEntitlements.consumeAllowance(
        command.tenantId,
        item,
        month,
        quantity,
        included,
      );
      return {
        covered: result.covered,
        restore: () =>
          this.planEntitlements.releaseAllowance(command.tenantId, item, month, result.covered),
      };
    } catch {
      // No entitlements for this plan. Charging everything is the safe
      // fallback: giving away free units on a lookup failure is not.
      return none;
    }
  }
}
