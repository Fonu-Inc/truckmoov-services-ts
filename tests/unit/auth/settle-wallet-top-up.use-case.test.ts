import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryWalletTopUpRepository } from '../../../apps/auth/src/in-memory-wallet-top-up.repository';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { SettleWalletTopUpUseCase } from '../../../apps/auth/src/settle-wallet-top-up.use-case';
import type { StoredWalletTopUp } from '../../../apps/auth/src/wallet-top-up.repository';
import type { RaisedAlert } from '../../../apps/auth/src/platform-alert.publisher';

const PAID = { amountKobo: 500_000, currency: 'NGN' };

function buildTopUp(overrides: Partial<StoredWalletTopUp> = {}): StoredWalletTopUp {
  return {
    id: 'top-1',
    tenantId: 'tenant-a',
    amountKobo: 500_000,
    provider: 'mtn_momo',
    mobileNumber: '+2348000000000',
    status: 'pending',
    reference: 'MOMO-ABCD1234',
    settledAt: null,
    createdAt: new Date('2026-08-21T00:00:00Z'),
    ...overrides,
  };
}

describe('SettleWalletTopUpUseCase', () => {
  let topUps: InMemoryWalletTopUpRepository;
  let wallets: InMemoryTenantWalletRepository;
  let useCase: SettleWalletTopUpUseCase;
  let raised: RaisedAlert[];

  beforeEach(async () => {
    topUps = new InMemoryWalletTopUpRepository();
    wallets = new InMemoryTenantWalletRepository();
    raised = [];
    useCase = new SettleWalletTopUpUseCase(topUps, wallets, { raise: async (alert: RaisedAlert) => void raised.push(alert) } as never);

    await topUps.save(buildTopUp());
    await wallets.save({
      tenantId: 'tenant-a',
      balanceKobo: 100_000,
      currency: 'NGN',
      updatedAt: new Date('2026-08-21T00:00:00Z'),
    });
  });

  it('credits the wallet once for a confirmed top-up', async () => {
    const result = await useCase.execute('MOMO-ABCD1234', PAID);

    expect(result.outcome).toBe('credited');
    expect(result.tenantId).toBe('tenant-a');

    const wallet = await wallets.findByTenantId('tenant-a');
    expect(wallet?.balanceKobo).toBe(600_000);
  });

  it('marks the top-up successful and stamps the settled time', async () => {
    await useCase.execute('MOMO-ABCD1234', PAID);

    const settled = await topUps.findByReference('MOMO-ABCD1234');
    expect(settled?.status).toBe('success');
    expect(settled?.settledAt).toBeInstanceOf(Date);
  });

  it('does not credit twice when the provider replays the callback', async () => {
    const first = await useCase.execute('MOMO-ABCD1234', PAID);
    const second = await useCase.execute('MOMO-ABCD1234', PAID);
    const third = await useCase.execute('MOMO-ABCD1234', PAID);

    expect(first.outcome).toBe('credited');
    expect(second.outcome).toBe('already_settled');
    expect(third.outcome).toBe('already_settled');

    const wallet = await wallets.findByTenantId('tenant-a');
    expect(wallet?.balanceKobo).toBe(600_000);
  });

  it('credits nothing for a reference it does not know', async () => {
    const result = await useCase.execute('MOMO-UNKNOWN', PAID);

    expect(result.outcome).toBe('not_found');
    expect(result.tenantId).toBeNull();

    const wallet = await wallets.findByTenantId('tenant-a');
    expect(wallet?.balanceKobo).toBe(100_000);
  });

  it('credits the tenant recorded on the top-up, not one supplied by the caller', async () => {
    await topUps.save(buildTopUp({ id: 'top-2', tenantId: 'tenant-b', reference: 'MOMO-BBBB2222' }));
    await wallets.save({
      tenantId: 'tenant-b',
      balanceKobo: 0,
      currency: 'NGN',
      updatedAt: new Date('2026-08-21T00:00:00Z'),
    });

    const result = await useCase.execute('MOMO-BBBB2222', PAID);

    expect(result.tenantId).toBe('tenant-b');
    expect((await wallets.findByTenantId('tenant-b'))?.balanceKobo).toBe(500_000);
    expect((await wallets.findByTenantId('tenant-a'))?.balanceKobo).toBe(100_000);
  });

  it('leaves an already-successful top-up alone', async () => {
    await topUps.save(
      buildTopUp({ id: 'top-3', reference: 'MOMO-DONE0000', status: 'success', settledAt: new Date() }),
    );

    const result = await useCase.execute('MOMO-DONE0000', PAID);

    expect(result.outcome).toBe('already_settled');
    const wallet = await wallets.findByTenantId('tenant-a');
    expect(wallet?.balanceKobo).toBe(100_000);
  });

  it('credits nothing and marks nothing when the paid amount differs', async () => {
    for (const paid of [{ amountKobo: 400_000, currency: 'NGN' }, { amountKobo: null, currency: 'NGN' }, undefined]) {
      const result = await useCase.execute('MOMO-ABCD1234', paid);
      expect(result.outcome).toBe('amount_mismatch');
    }

    expect((await wallets.findByTenantId('tenant-a'))?.balanceKobo).toBe(100_000);
    expect((await topUps.findByReference('MOMO-ABCD1234'))?.status).toBe('pending');
  });

  it('raises a billing alert when the paid amount differs', async () => {
    await useCase.execute('MOMO-ABCD1234', { amountKobo: 400_000, currency: 'NGN' });

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ alertType: 'billing_alerts', context: { reference: 'MOMO-ABCD1234', paidKobo: 400_000 } });
  });

  it('rejects a payment in another currency', async () => {
    const result = await useCase.execute('MOMO-ABCD1234', { amountKobo: 500_000, currency: 'USD' });

    expect(result.outcome).toBe('amount_mismatch');
    expect((await wallets.findByTenantId('tenant-a'))?.balanceKobo).toBe(100_000);
  });

  it('creates the wallet when the tenant has none', async () => {
    await topUps.save(buildTopUp({ id: 'top-9', tenantId: 'tenant-new', reference: 'MOMO-NEW00000' }));

    const result = await useCase.execute('MOMO-NEW00000', PAID);

    expect(result.outcome).toBe('credited');
    expect((await wallets.findByTenantId('tenant-new'))?.balanceKobo).toBe(500_000);
  });

  it('repairs a crash between the credit and the settled mark without crediting twice', async () => {
    const markSettled = topUps.markSettled.bind(topUps);
    topUps.markSettled = async () => {
      throw new Error('crash');
    };
    await expect(useCase.execute('MOMO-ABCD1234', PAID)).rejects.toThrow('crash');
    topUps.markSettled = markSettled;

    const retry = await useCase.execute('MOMO-ABCD1234', PAID);

    expect(retry.outcome).toBe('credited');
    expect((await wallets.findByTenantId('tenant-a'))?.balanceKobo).toBe(600_000);
    expect((await topUps.findByReference('MOMO-ABCD1234'))?.status).toBe('success');
  });
});
