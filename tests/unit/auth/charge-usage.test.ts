import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ChargeUsageUseCase,
  InsufficientWalletBalanceError,
} from '../../../apps/auth/src/charge-usage.use-case';
import { CommunicationRateService } from '../../../apps/auth/src/communication-rate.service';
import { InMemoryCommunicationRatesRepository } from '../../../apps/auth/src/in-memory-communication-rates.repository';
import { ChannelDisabledError } from '../../../apps/auth/src/communication-rates.repository';
import { billingMonth } from '../../../apps/auth/src/sim-recurring-charge.service';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import { EntitlementService } from '../../../apps/auth/src/entitlement.service';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { InMemoryWalletLedgerRepository } from '../../../apps/auth/src/in-memory-wallet-ledger.repository';
import { InMemorySpendingLimitRepository } from '../../../apps/auth/src/in-memory-spending-limit.repository';
import { SpendingLimitExceededError, SpendingLimitService, windowStartFor } from '../../../apps/auth/src/spending-limit.service';
import {
  ChargeReferenceRequiredError,
  allowanceMonth,
} from '../../../apps/auth/src/charge-usage.use-case';

function build(options: {
  balanceOk?: boolean;
  limitThrows?: boolean;
  includedMessages?: number;
} = {}) {
  const planRepo = new InMemoryPlanEntitlementsRepository();
  const rates = new CommunicationRateService(new InMemoryCommunicationRatesRepository());
  const debit = vi.fn(async () => ({
    ok: options.balanceOk ?? true,
    balanceAfterKobo: 12_345,
  }));
  const assertWithinLimit = vi.fn(async () => {
    if (options.limitThrows) throw new Error('Spending limit reached');
  });

  const useCase = new ChargeUsageUseCase(
    rates,
    { assertWithinLimit, recordSpend: async () => {} } as never,
    // The low-balance warning has its own tests; here it must not affect the charge.
    { afterDebit: async () => {} } as never,
    { debit, ensure: async () => ({}), findByTenantId: async () => null } as never,
    new EntitlementService(planRepo),
    planRepo,
    { findByIdempotencyKey: async () => null } as never,
    { findByTenantId: async () => null } as never,
  );
  return { useCase, rates, debit, assertWithinLimit, planRepo };
}

async function withPlan(planRepo: InMemoryPlanEntitlementsRepository, includedMessages: number) {
  await planRepo.save(
    {
      planCode: 'starter',
      paymentModel: 'prepaid',
      inheritsFromCode: null,
      quotas: {},
      limitBehaviour: {},
      features: [],
      allowances: [{ item: 'messages', includedPerMonth: includedMessages }],
      availableFor: ['fleet_provider'],
      trialDays: 14,
    },
    null,
  );
}

const command = {
  tenantId: 'tenant-a',
  channel: 'sms' as const,
  quantity: 100,
  reason: 'campaign blast',
  reference: 'campaign-1',
};

describe('charging usage', () => {
  it('debits the wallet at the configured rate', async () => {
    const { useCase, debit } = build();

    const result = await useCase.execute(command);

    expect(result.charged).toBe(true);
    expect(result.totalKobo).toBe(60_000);
    expect(debit).toHaveBeenCalledWith('tenant-a', 60_000, expect.anything());
  });

  it('records the rate on the ledger line, so the charge can be explained later', async () => {
    const { useCase, debit } = build();

    await useCase.execute(command);

    expect(debit.mock.calls[0][2]).toMatchObject({ unitRateKobo: 600, quantity: 100 });
  });

  it('files the charge under the channel category, not one lump', async () => {
    const { useCase, debit } = build();

    await useCase.execute({ ...command, channel: 'whatsapp' });

    expect(debit.mock.calls[0][2]).toMatchObject({ category: 'whatsapp' });
  });

  it('files an IoT SIM charge under sim provisioning', async () => {
    const { useCase, debit } = build();

    await useCase.execute({ ...command, channel: 'iot_sim', quantity: 3 });

    expect(debit.mock.calls[0][2]).toMatchObject({ category: 'sim_provisioning' });
  });
});

// The wallet is prepaid, so a charge that cannot refuse is not a charge.
describe('refusal', () => {
  it('refuses when the balance is short', async () => {
    const { useCase } = build({ balanceOk: false });

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
  });

  it('checks the spending limit before touching the balance', async () => {
    const { useCase, debit } = build({ limitThrows: true });

    await expect(useCase.execute(command)).rejects.toThrow('Spending limit reached');
    expect(debit).not.toHaveBeenCalled();
  });

  it('applies the spending limit to every channel, not just data bundles', async () => {
    const { useCase, assertWithinLimit } = build();

    await useCase.execute({ ...command, channel: 'voice', quantity: 10 });

    expect(assertWithinLimit).toHaveBeenCalledWith('tenant-a', 22_000);
  });

  it('refuses a disabled channel rather than sending free', async () => {
    const { useCase, rates, debit } = build();
    await rates.reprice('whatsapp', 1_000, { actorId: 'staff-1', enabled: false });

    await expect(
      useCase.execute({ ...command, channel: 'whatsapp' }),
    ).rejects.toBeInstanceOf(ChannelDisabledError);
    expect(debit).not.toHaveBeenCalled();
  });
});

describe('pricing uses the rate live when the usage happened', () => {
  it('charges an old event at the old rate', async () => {
    const { useCase, debit } = build();

    await useCase.execute({
      ...command,
      quantity: 10,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(debit.mock.calls[0][1]).toBe(6_000);
  });
});

describe('the monthly SIM charge is idempotent per month', () => {
  it('keys the charge by tenant and billing month', () => {
    expect(billingMonth(new Date('2026-08-25T10:00:00.000Z'))).toBe('2026-08');
  });

  it('gives two months two different keys', () => {
    expect(billingMonth(new Date('2026-08-31T22:59:59.000Z'))).not.toBe(
      billingMonth(new Date('2026-08-31T23:00:00.000Z')),
    );
  });

  it('uses Lagos time, so 00:30 on the 1st in Lagos is already the new month', () => {
    expect(billingMonth(new Date('2026-08-31T23:30:00.000Z'))).toBe('2026-09');
    expect(allowanceMonth(new Date('2026-08-31T23:30:00.000Z'))).toBe('2026-09');
  });
});

describe('the plan allowance is used before the wallet', () => {
  it('charges nothing while the allowance covers the usage', async () => {
    const { useCase, planRepo, debit } = build();
    await withPlan(planRepo, 1_000);

    const result = await useCase.execute({ ...command, quantity: 400, planCode: 'starter' });

    expect(result.charged).toBe(false);
    expect(result.coveredByAllowance).toBe(400);
    expect(debit).toHaveBeenCalledWith('tenant-a', 0, expect.objectContaining({ idempotencyKey: 'usage:campaign-1' }));
  });

  it('charges only the part the allowance does not cover', async () => {
    const { useCase, planRepo, debit } = build();
    await withPlan(planRepo, 1_000);

    await useCase.execute({ ...command, quantity: 1_000, planCode: 'starter' });
    const result = await useCase.execute({ ...command, quantity: 500, planCode: 'starter' });

    expect(result.coveredByAllowance).toBe(0);
    expect(result.chargedUnits).toBe(500);
    // 500 messages at 6 Naira, not 1500.
    expect(debit.mock.calls[1][1]).toBe(300_000);
  });

  it('splits a single send that crosses the allowance boundary', async () => {
    const { useCase, planRepo, debit } = build();
    await withPlan(planRepo, 100);

    const result = await useCase.execute({ ...command, quantity: 250, planCode: 'starter' });

    expect(result.coveredByAllowance).toBe(100);
    expect(result.chargedUnits).toBe(150);
    expect(debit.mock.calls[0][1]).toBe(90_000);
  });

  it('charges everything when the tenant is on no plan', async () => {
    const { useCase, debit } = build();

    const result = await useCase.execute({ ...command, quantity: 10 });

    expect(result.coveredByAllowance).toBe(0);
    expect(debit.mock.calls[0][1]).toBe(6_000);
  });

  it('charges everything when the plan includes no allowance', async () => {
    const { useCase, planRepo, debit } = build();
    await withPlan(planRepo, 0);

    await useCase.execute({ ...command, quantity: 10, planCode: 'starter' });

    expect(debit.mock.calls[0][1]).toBe(6_000);
  });

  it('records only the charged units on the ledger line', async () => {
    const { useCase, planRepo, debit } = build();
    await withPlan(planRepo, 100);

    await useCase.execute({ ...command, quantity: 250, planCode: 'starter' });

    expect(debit.mock.calls[0][2]).toMatchObject({ quantity: 150 });
  });
});

async function buildWithRealWallet(balanceKobo: number, includedMessages = 0) {
  const planRepo = new InMemoryPlanEntitlementsRepository();
  if (includedMessages > 0) await withPlan(planRepo, includedMessages);
  const wallet = new InMemoryTenantWalletRepository();
  const stored = await wallet.ensure('tenant-a');
  stored.balanceKobo = balanceKobo;
  const useCase = new ChargeUsageUseCase(
    new CommunicationRateService(new InMemoryCommunicationRatesRepository()),
    { assertWithinLimit: async () => {}, recordSpend: async () => {} } as never,
    { afterDebit: async () => {} } as never,
    wallet,
    new EntitlementService(planRepo),
    planRepo,
    new InMemoryWalletLedgerRepository(wallet),
    { findByTenantId: async () => null } as never,
  );
  const usedMessages = async () =>
    (await planRepo.findUsage('tenant-a', allowanceMonth(new Date()))).find(
      (u) => u.item === 'messages',
    )?.used ?? 0;
  return { useCase, wallet, usedMessages };
}

describe('charging the same reference twice', () => {
  it('debits once and returns the original result on a replay', async () => {
    const { useCase, wallet } = await buildWithRealWallet(1_000_000);

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first.replayed).toBe(false);
    expect(second).toMatchObject({ replayed: true, charged: true, totalKobo: 60_000 });
    expect(second.balanceAfterKobo).toBe(first.balanceAfterKobo);
    expect(wallet.ledger).toHaveLength(1);
    expect((await wallet.findByTenantId('tenant-a'))?.balanceKobo).toBe(940_000);
    expect(wallet.ledger[0].idempotencyKey).toBe('usage:campaign-1');
  });

  it('does not consume allowance again on a replay', async () => {
    const { useCase, usedMessages } = await buildWithRealWallet(1_000_000, 40);
    const withPlanCode = { ...command, planCode: 'starter' };

    const first = await useCase.execute(withPlanCode);
    const second = await useCase.execute(withPlanCode);

    expect(first.coveredByAllowance).toBe(40);
    expect(second).toMatchObject({ replayed: true, coveredByAllowance: 40, chargedUnits: 60 });
    expect(await usedMessages()).toBe(40);
  });

  it('does not consume allowance again when the allowance covered the whole charge', async () => {
    const { useCase, usedMessages, wallet } = await buildWithRealWallet(1_000_000, 500);
    const withPlanCode = { ...command, planCode: 'starter' };

    const first = await useCase.execute(withPlanCode);
    const second = await useCase.execute(withPlanCode);

    expect(first).toMatchObject({ charged: false, coveredByAllowance: 100 });
    expect(second).toMatchObject({ charged: false, replayed: true, coveredByAllowance: 100 });
    expect(await usedMessages()).toBe(100);
    expect((await wallet.findByTenantId('tenant-a'))?.balanceKobo).toBe(1_000_000);
  });

  it('charges a different reference separately', async () => {
    const { useCase, wallet } = await buildWithRealWallet(1_000_000);

    await useCase.execute(command);
    await useCase.execute({ ...command, reference: 'campaign-2' });

    expect(wallet.ledger).toHaveLength(2);
  });
});

describe('a refused debit', () => {
  it('gives the consumed allowance back', async () => {
    const { useCase, wallet, usedMessages } = await buildWithRealWallet(0, 40);

    await expect(useCase.execute({ ...command, planCode: 'starter' })).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError,
    );

    expect(await usedMessages()).toBe(0);
    expect(wallet.ledger).toHaveLength(0);
  });

  it('gives the allowance back when the spending limit refuses', async () => {
    const { useCase, usedMessages } = await buildWithRealWallet(1_000_000, 40);
    const limited = new ChargeUsageUseCase(
      (useCase as never as { rates: never }).rates,
      { assertWithinLimit: async () => { throw new Error('Spending limit reached'); } } as never,
      { afterDebit: async () => {} } as never,
      (useCase as never as { wallet: never }).wallet,
      (useCase as never as { entitlements: never }).entitlements,
      (useCase as never as { planEntitlements: never }).planEntitlements,
      (useCase as never as { ledger: never }).ledger,
      { findByTenantId: async () => null } as never,
    );

    await expect(limited.execute({ ...command, planCode: 'starter' })).rejects.toThrow(
      'Spending limit reached',
    );
    expect(await usedMessages()).toBe(0);
  });
});

describe('the reference is required', () => {
  it.each(['', '   '])('rejects %j before any lookup or charge', async (reference) => {
    const { useCase, debit } = build();

    await expect(useCase.execute({ ...command, reference })).rejects.toBeInstanceOf(
      ChargeReferenceRequiredError,
    );
    expect(debit).not.toHaveBeenCalled();
  });
});

describe('what a charge reads from the tenant', () => {
  async function buildWith(limit: SpendingLimitService, planCode: string | null) {
    const planRepo = new InMemoryPlanEntitlementsRepository();
    await withPlan(planRepo, 40);
    const wallet = new InMemoryTenantWalletRepository();
    (await wallet.ensure('tenant-a')).balanceKobo = 1_000_000;
    return new ChargeUsageUseCase(
      new CommunicationRateService(new InMemoryCommunicationRatesRepository()),
      limit,
      { afterDebit: async () => {} } as never,
      wallet,
      new EntitlementService(planRepo),
      planRepo,
      new InMemoryWalletLedgerRepository(wallet),
      { findByTenantId: async () => (planCode ? { subscription: { planCode } } : null) } as never,
    );
  }

  it('applies the subscribed plan allowance when the caller names no plan', async () => {
    const limit = new SpendingLimitService(new InMemorySpendingLimitRepository(), { publish: async () => {} } as never);
    const useCase = await buildWith(limit, 'starter');

    const result = await useCase.execute(command);

    expect(result).toMatchObject({ coveredByAllowance: 40, chargedUnits: 60 });
  });

  it('counts a charge toward the spending limit, so the next one past it is refused', async () => {
    const repo = new InMemorySpendingLimitRepository();
    await repo.save({
      tenantId: 'tenant-a', enabled: true, monthlyLimitKobo: 100_000, spentThisMonthKobo: 0, resetDayOfMonth: 1,
      alertEmail: null, notifyAtPercentages: [], windowStartedOn: windowStartFor(1, new Date()), notifiedPercentages: [],
      updatedAt: new Date(),
    });
    const useCase = await buildWith(new SpendingLimitService(repo, { publish: async () => {} } as never), null);

    await useCase.execute(command);

    expect((await repo.findByTenantId('tenant-a'))?.spentThisMonthKobo).toBe(60_000);
    await expect(useCase.execute({ ...command, reference: 'campaign-2' })).rejects.toBeInstanceOf(SpendingLimitExceededError);
  });
});
