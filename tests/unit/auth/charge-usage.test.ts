import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ChargeUsageUseCase,
  InsufficientWalletBalanceError,
} from '../../../apps/auth/src/charge-usage.use-case';
import { CommunicationRateService } from '../../../apps/auth/src/communication-rate.service';
import { InMemoryCommunicationRatesRepository } from '../../../apps/auth/src/in-memory-communication-rates.repository';
import { ChannelDisabledError } from '../../../apps/auth/src/communication-rates.repository';
import { billingMonth } from '../../../apps/auth/src/sim-recurring-charge.service';

function build(options: { balanceOk?: boolean; limitThrows?: boolean } = {}) {
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
    { assertWithinLimit } as never,
    { debit } as never,
  );
  return { useCase, rates, debit, assertWithinLimit };
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
    expect(billingMonth(new Date('2026-08-31T23:59:59.000Z'))).not.toBe(
      billingMonth(new Date('2026-09-01T00:00:00.000Z')),
    );
  });

  it('uses UTC, so a sweep near midnight does not double-charge a boundary', () => {
    expect(billingMonth(new Date('2026-09-01T00:30:00.000Z'))).toBe('2026-09');
  });
});
