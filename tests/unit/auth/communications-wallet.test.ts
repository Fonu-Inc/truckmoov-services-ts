import { describe, expect, it, beforeEach } from 'vitest';
import { GetCommunicationsRatesUseCase } from '../../../apps/auth/src/get-communications-rates.use-case';
import {
  GetCommunicationsSpendBreakdownUseCase,
  GetCommunicationsSpendTrendUseCase,
} from '../../../apps/auth/src/get-communications-spend-analytics.use-case';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { InMemoryWalletLedgerRepository } from '../../../apps/auth/src/in-memory-wallet-ledger.repository';
import type { WalletLedgerDraft } from '../../../apps/auth/src/wallet-ledger.repository';
import { ListWalletLedgerUseCase } from '../../../apps/auth/src/list-wallet-ledger.use-case';

const TOKEN = 'tenant-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'actor-1' }) as never };
}

function user(id: string, tenantId: string) {
  return { id, email: `${id}@x`, passwordHash: 'x', role: 'OWNER_OPERATOR', tenantId, accountStatus: 'enabled' };
}

function userRepo(tenantId = 'tenant-a') {
  const table: Record<string, unknown> = { 'actor-1': user('actor-1', tenantId) };
  return { findById: async (id: string) => table[id] ?? null };
}

function systemUserRepo() {
  const table: Record<string, unknown> = { 'actor-1': user('actor-1', 'system') };
  return { findById: async (id: string) => table[id] ?? null };
}

function draft(overrides: Partial<WalletLedgerDraft> = {}): WalletLedgerDraft {
  return {
    category: 'sms',
    quantity: 1,
    unitRateKobo: 500,
    reason: 'SMS usage',
    reference: null,
    ...overrides,
  };
}

describe('GetCommunicationsRatesUseCase', () => {
  it('returns current rates for a tenant', async () => {
    const currentRates = [{ channel: 'sms', rateKobo: 500, enabled: true }];
    const rateService = { currentRates: async () => currentRates } as never;
    const useCase = new GetCommunicationsRatesUseCase(tokenService() as never, userRepo() as never, rateService);

    const result = await useCase.execute(TOKEN);

    expect(result.data).toEqual(currentRates);
  });

  it('refuses a system actor', async () => {
    const rateService = { currentRates: async () => [] } as never;
    const useCase = new GetCommunicationsRatesUseCase(tokenService() as never, systemUserRepo() as never, rateService);
    await expect(useCase.execute(TOKEN)).rejects.toThrow();
  });
});

describe('GetCommunicationsSpendBreakdownUseCase', () => {
  let wallet: InMemoryTenantWalletRepository;
  let ledger: InMemoryWalletLedgerRepository;

  beforeEach(async () => {
    wallet = new InMemoryTenantWalletRepository();
    ledger = new InMemoryWalletLedgerRepository(wallet);
    await wallet.save({ tenantId: 'tenant-a', balanceKobo: 1_000_000, currency: 'NGN', updatedAt: new Date() });
  });

  it('splits spend by channel, data bundles included, with the wallet total', async () => {
    await wallet.debit('tenant-a', 5_000, draft({ category: 'sms' }));
    await wallet.debit('tenant-a', 15_000, draft({ category: 'whatsapp' }));
    await wallet.debit('tenant-a', 200_000, draft({ category: 'data_bundle' }));

    const useCase = new GetCommunicationsSpendBreakdownUseCase(tokenService() as never, userRepo() as never, ledger);
    const result = await useCase.execute(TOKEN, '30d');

    const byChannel = Object.fromEntries(result.data.breakdown.map((b: { channel: string; amount: number }) => [b.channel, b.amount]));
    expect(byChannel.sms).toBe(50);
    expect(byChannel.whatsapp).toBe(150);
    expect(byChannel.voice).toBe(0);
    expect(byChannel.ai).toBe(0);
    expect(byChannel.data_bundle).toBe(2_000);
    expect(result.data.total).toBe(2_200);
  });

  it('computes percentage share across channels', async () => {
    await wallet.debit('tenant-a', 25_000, draft({ category: 'sms' }));
    await wallet.debit('tenant-a', 75_000, draft({ category: 'voice' }));

    const useCase = new GetCommunicationsSpendBreakdownUseCase(tokenService() as never, userRepo() as never, ledger);
    const result = await useCase.execute(TOKEN, '30d');

    const byChannel = Object.fromEntries(result.data.breakdown.map((b: { channel: string; percentage: number }) => [b.channel, b.percentage]));
    expect(byChannel.sms).toBe(25);
    expect(byChannel.voice).toBe(75);
  });
});

describe('ListWalletLedgerUseCase', () => {
  let wallet: InMemoryTenantWalletRepository;
  let ledger: InMemoryWalletLedgerRepository;

  beforeEach(async () => {
    wallet = new InMemoryTenantWalletRepository();
    ledger = new InMemoryWalletLedgerRepository(wallet);
    await wallet.save({ tenantId: 'tenant-a', balanceKobo: 1_000_000, currency: 'NGN', updatedAt: new Date() });
    await wallet.debit('tenant-a', 5_000, draft({ category: 'sms' }));
  });

  it('keeps only lines inside from/to', async () => {
    const useCase = new ListWalletLedgerUseCase(tokenService() as never, userRepo() as never, ledger);
    const hourAgo = new Date(Date.now() - 3_600_000);
    const inHour = new Date(Date.now() + 3_600_000);

    expect((await useCase.execute(TOKEN, { from: hourAgo, to: inHour })).data.total).toBe(1);
    expect((await useCase.execute(TOKEN, { from: inHour })).data.total).toBe(0);
    expect((await useCase.execute(TOKEN, { to: hourAgo })).data.total).toBe(0);
  });

  it("exports the caller's lines in range as CSV", async () => {
    const useCase = new ListWalletLedgerUseCase(tokenService() as never, userRepo() as never, ledger);
    const csv = (await useCase.export(TOKEN, { from: new Date(Date.now() - 3_600_000) })).buffer.toString();

    expect(csv).toContain('SMS usage');
    expect((await useCase.export(TOKEN, { from: new Date(Date.now() + 3_600_000) })).buffer.toString()).not.toContain('SMS usage');
  });
});

describe('GetCommunicationsSpendTrendUseCase', () => {
  let wallet: InMemoryTenantWalletRepository;
  let ledger: InMemoryWalletLedgerRepository;

  beforeEach(async () => {
    wallet = new InMemoryTenantWalletRepository();
    ledger = new InMemoryWalletLedgerRepository(wallet);
    await wallet.save({ tenantId: 'tenant-a', balanceKobo: 1_000_000, currency: 'NGN', updatedAt: new Date() });
  });

  it('zero-fills days with no spend across the window', async () => {
    await wallet.debit('tenant-a', 5_000, draft({ category: 'sms' }));

    const useCase = new GetCommunicationsSpendTrendUseCase(tokenService() as never, userRepo() as never, ledger);
    const result = await useCase.execute(TOKEN, '7d');

    expect(result.data.points).toHaveLength(8); // inclusive of both endpoints
    const nonZero = result.data.points.filter((p: { amount: number }) => p.amount > 0);
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0].amount).toBe(50);
  });

  it('excludes data-bundle spend from the trend', async () => {
    await wallet.debit('tenant-a', 200_000, draft({ category: 'data_bundle' }));

    const useCase = new GetCommunicationsSpendTrendUseCase(tokenService() as never, userRepo() as never, ledger);
    const result = await useCase.execute(TOKEN, '7d');

    const total = result.data.points.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    expect(total).toBe(0);
  });
});
