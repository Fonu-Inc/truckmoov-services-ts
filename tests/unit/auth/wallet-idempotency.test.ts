import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { InMemoryWalletLedgerRepository } from '../../../apps/auth/src/in-memory-wallet-ledger.repository';
import {
  WALLET_LEDGER_CATEGORIES,
  type WalletLedgerDraft,
} from '../../../apps/auth/src/wallet-ledger.repository';

function draft(overrides: Partial<WalletLedgerDraft> = {}): WalletLedgerDraft {
  return { category: 'sms', quantity: 1, unitRateKobo: 1000, reason: 'test', ...overrides };
}

describe('Wallet ledger idempotency', () => {
  let wallet: InMemoryTenantWalletRepository;
  let ledger: InMemoryWalletLedgerRepository;

  beforeEach(async () => {
    wallet = new InMemoryTenantWalletRepository();
    ledger = new InMemoryWalletLedgerRepository(wallet);
    await wallet.save({
      tenantId: 'tenant-a',
      balanceKobo: 100_000,
      currency: 'NGN',
      updatedAt: new Date(),
    });
  });

  async function balance(): Promise<number> {
    return (await wallet.findByTenantId('tenant-a'))!.balanceKobo;
  }

  it('replays a credit with the original entry and no balance change', async () => {
    const first = await wallet.credit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' }));
    const second = await wallet.credit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' }));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.entry?.id).toBe(first.entry?.id);
    expect(second.balanceAfterKobo).toBe(105_000);
    expect(await balance()).toBe(105_000);
    expect((await ledger.list('tenant-a')).total).toBe(1);
  });

  it('replays a debit with the original entry and no balance change', async () => {
    const first = await wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' }));
    await wallet.credit('tenant-a', 1_000, draft());
    const second = await wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' }));

    expect(second.replayed).toBe(true);
    expect(second.entry?.id).toBe(first.entry?.id);
    expect(second.balanceAfterKobo).toBe(95_000);
    expect(await balance()).toBe(96_000);
  });

  it('applies different keys both', async () => {
    await wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' }));
    await wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k2' }));

    expect(await balance()).toBe(90_000);
  });

  it('scopes keys per tenant', async () => {
    await wallet.save({ tenantId: 'tenant-b', balanceKobo: 10_000, currency: 'NGN', updatedAt: new Date() });
    await wallet.debit('tenant-a', 1_000, draft({ idempotencyKey: 'k1' }));
    const other = await wallet.debit('tenant-b', 1_000, draft({ idempotencyKey: 'k1' }));

    expect(other.replayed).toBe(false);
    expect(other.balanceAfterKobo).toBe(9_000);
  });

  it('behaves as before without a key', async () => {
    const a = await wallet.debit('tenant-a', 5_000, draft());
    const b = await wallet.debit('tenant-a', 5_000, draft());

    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
    expect(await balance()).toBe(90_000);
    expect((await ledger.list('tenant-a')).items.every((i) => i.idempotencyKey === null)).toBe(true);
  });

  it('applies concurrent same-key calls once', async () => {
    const results = await Promise.all([
      wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' })),
      wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' })),
      wallet.debit('tenant-a', 5_000, draft({ idempotencyKey: 'k1' })),
    ]);

    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await balance()).toBe(95_000);
  });

  it('accepts adjustment and goodwill categories', async () => {
    expect(WALLET_LEDGER_CATEGORIES).toContain('adjustment');
    expect(WALLET_LEDGER_CATEGORIES).toContain('goodwill');
    await wallet.credit('tenant-a', 1_000, draft({ category: 'goodwill' }));
    await wallet.credit('tenant-a', 1_000, draft({ category: 'adjustment' }));

    expect((await ledger.list('tenant-a', { category: 'goodwill' })).total).toBe(1);
    expect(await ledger.sum('tenant-a', { category: 'adjustment' })).toBe(1_000);
  });

  it('treats an empty or blank key as no key, so repeated calls each apply', async () => {
    await wallet.credit('tenant-a', 1000, draft({ idempotencyKey: '' }));
    await wallet.credit('tenant-a', 1000, draft({ idempotencyKey: '   ' }));

    expect(await balance()).toBe(102_000);
  });

  it('refuses a key the column cannot hold before any money moves', async () => {
    await expect(
      wallet.credit('tenant-a', 1000, draft({ idempotencyKey: 'k'.repeat(161) })),
    ).rejects.toThrow(/160/);

    expect(await balance()).toBe(100_000);
  });

  it('returns a copy on replay, so a caller cannot change the stored ledger', async () => {
    const first = await wallet.credit('tenant-a', 1000, draft({ idempotencyKey: 'copy' }));
    first.entry!.reason = 'tampered';

    const again = await wallet.credit('tenant-a', 1000, draft({ idempotencyKey: 'copy' }));
    expect(again.entry?.reason).toBe('test');
  });
});
