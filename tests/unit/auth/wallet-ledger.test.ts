import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { InMemoryWalletLedgerRepository } from '../../../apps/auth/src/in-memory-wallet-ledger.repository';
import type { WalletLedgerDraft } from '../../../apps/auth/src/wallet-ledger.repository';

function draft(overrides: Partial<WalletLedgerDraft> = {}): WalletLedgerDraft {
  return {
    category: 'data_bundle',
    quantity: 1,
    unitRateKobo: 150_000,
    reason: 'MTN 1GB Monthly for 1 SIM(s)',
    reference: 'bundle-1',
    ...overrides,
  };
}

describe('Wallet ledger', () => {
  let wallet: InMemoryTenantWalletRepository;
  let ledger: InMemoryWalletLedgerRepository;

  beforeEach(async () => {
    wallet = new InMemoryTenantWalletRepository();
    ledger = new InMemoryWalletLedgerRepository(wallet);
    await wallet.save({
      tenantId: 'tenant-a',
      balanceKobo: 1_000_000,
      currency: 'NGN',
      updatedAt: new Date(),
    });
  });

  it('records the balance after a debit', async () => {
    const result = await wallet.debit('tenant-a', 150_000, draft());

    expect(result.ok).toBe(true);
    expect(result.balanceAfterKobo).toBe(850_000);
    const { items } = await ledger.list('tenant-a');
    expect(items[0]?.balanceAfterKobo).toBe(850_000);
  });

  it('records a running balance across several movements', async () => {
    await wallet.debit('tenant-a', 100_000, draft());
    await wallet.debit('tenant-a', 250_000, draft());
    await wallet.credit('tenant-a', 50_000, draft({ category: 'refund' }));

    const { items } = await ledger.list('tenant-a');
    expect(items.map((i) => i.balanceAfterKobo)).toEqual([700_000, 650_000, 900_000]);
  });

  it('stores the rate applied at the time, not a reference to the current rate', async () => {
    await wallet.debit('tenant-a', 150_000, draft({ unitRateKobo: 150_000 }));
    await wallet.debit('tenant-a', 200_000, draft({ unitRateKobo: 200_000 }));

    const { items } = await ledger.list('tenant-a');
    const rates = items.map((i) => i.unitRateKobo).sort((a, b) => a - b);
    expect(rates).toEqual([150_000, 200_000]);
  });

  it('keeps the quantity and reason the screen displays', async () => {
    await wallet.debit('tenant-a', 750_000, draft({ quantity: 5, reason: 'MTN 1GB for 5 SIM(s)' }));

    const { items } = await ledger.list('tenant-a');
    expect(items[0]?.quantity).toBe(5);
    expect(items[0]?.reason).toBe('MTN 1GB for 5 SIM(s)');
  });

  it('writes no entry when the balance does not cover the debit', async () => {
    const result = await wallet.debit('tenant-a', 5_000_000, draft());

    expect(result.ok).toBe(false);
    expect(result.balanceAfterKobo).toBeNull();
    expect((await ledger.list('tenant-a')).total).toBe(0);
  });

  it('marks the direction of each movement', async () => {
    await wallet.debit('tenant-a', 100_000, draft());
    await wallet.credit('tenant-a', 40_000, draft({ category: 'top_up' }));

    expect((await ledger.list('tenant-a', { direction: 'credit' })).total).toBe(1);
    expect((await ledger.list('tenant-a', { direction: 'debit' })).total).toBe(1);
  });

  it('separates spend by category on one wallet', async () => {
    await wallet.debit('tenant-a', 100_000, draft({ category: 'data_bundle' }));
    await wallet.debit('tenant-a', 30_000, draft({ category: 'sms' }));
    await wallet.debit('tenant-a', 20_000, draft({ category: 'sms' }));

    expect(await ledger.sum('tenant-a', { category: 'sms' })).toBe(50_000);
    expect(await ledger.sum('tenant-a', { category: 'data_bundle' })).toBe(100_000);
  });

  it('keeps one tenant out of another tenant ledger', async () => {
    await wallet.save({ tenantId: 'tenant-b', balanceKobo: 500_000, currency: 'NGN', updatedAt: new Date() });
    await wallet.debit('tenant-a', 100_000, draft());
    await wallet.debit('tenant-b', 200_000, draft());

    const a = await ledger.list('tenant-a');
    expect(a.total).toBe(1);
    expect(a.items[0]?.amountKobo).toBe(100_000);
  });

  it('returns the newest entry first', async () => {
    await wallet.debit('tenant-a', 10_000, draft({ reason: 'first' }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await wallet.debit('tenant-a', 20_000, draft({ reason: 'second' }));

    const { items } = await ledger.list('tenant-a');
    expect(items[0]?.reason).toBe('second');
  });

  it('pages the ledger', async () => {
    for (let i = 0; i < 5; i++) {
      await wallet.debit('tenant-a', 10_000, draft());
    }

    const page = await ledger.list('tenant-a', { page: 2, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });
});
