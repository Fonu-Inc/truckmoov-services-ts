import { describe, expect, it, vi } from 'vitest';
import { ChargeUsageUseCase } from '../../../apps/auth/src/charge-usage.use-case';
import { CommunicationRateService } from '../../../apps/auth/src/communication-rate.service';
import { EntitlementService } from '../../../apps/auth/src/entitlement.service';
import { InMemoryCommunicationRatesRepository } from '../../../apps/auth/src/in-memory-communication-rates.repository';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import { InMemorySimRepository } from '../../../apps/auth/src/in-memory-sim.repository';
import { InMemoryWalletLedgerRepository } from '../../../apps/auth/src/in-memory-wallet-ledger.repository';
import { InMemoryTenantWalletRepository } from '../../../apps/auth/src/in-memory-tenant-wallet.repository';
import { InMemoryArrearsRepository } from '../../../apps/auth/src/in-memory-enforcement-automation.repositories';
import { SimRecurringChargeService } from '../../../apps/auth/src/sim-recurring-charge.service';
import type { StoredSim } from '../../../apps/auth/src/sim.repository';
import { runIfLockFree } from '@shared/db';

function sim(id: string, tenantId: string | null, status = 'active'): StoredSim {
  return { id, iccid: id, tenantId, status } as StoredSim;
}

async function build(funds: Record<string, number>) {
  const wallet = new InMemoryTenantWalletRepository();
  for (const [tenantId, balanceKobo] of Object.entries(funds)) {
    const w = await wallet.ensure(tenantId);
    w.balanceKobo = balanceKobo;
  }
  const planRepo = new InMemoryPlanEntitlementsRepository();
  const chargeUsage = new ChargeUsageUseCase(
    new CommunicationRateService(new InMemoryCommunicationRatesRepository()),
    { assertWithinLimit: async () => {} } as never,
    { afterDebit: async () => {} } as never,
    wallet,
    new EntitlementService(planRepo),
    planRepo,
    new InMemoryWalletLedgerRepository(wallet),
  );
  const sims = new InMemorySimRepository();
  const config = { persistence: { backend: 'memory' } } as never;
  const arrears = new InMemoryArrearsRepository();
  const service = new SimRecurringChargeService(config, chargeUsage, sims, arrears);
  return { service, wallet, sims, arrears };
}

describe('sim monthly charge', () => {
  it('charges rate times active SIMs once, and nothing on a second sweep', async () => {
    const { service, wallet, sims } = await build({ a: 1_000_000 });
    await sims.save(sim('1', 'a'));
    await sims.save(sim('2', 'a'));
    await sims.save(sim('3', 'a', 'suspended'));

    expect(await service.run()).toEqual({ tenants: 1, charged: 1 });
    expect(await service.run()).toEqual({ tenants: 1, charged: 0 });

    expect(wallet.ledger).toHaveLength(1);
    expect((await wallet.findByTenantId('a'))?.balanceKobo).toBe(1_000_000 - 2 * 50_000);
  });

  it('charges once when two sweeps run concurrently', async () => {
    const { service, wallet, sims } = await build({ a: 1_000_000 });
    await sims.save(sim('1', 'a'));

    await Promise.all([service.run(), service.run()]);

    expect(wallet.ledger).toHaveLength(1);
  });

  it('bills a replay as already billed even when two services race', async () => {
    const first = await build({ a: 1_000_000 });
    await first.sims.save(sim('1', 'a'));
    const second = new SimRecurringChargeService(
      { persistence: { backend: 'memory' } } as never,
      (first.service as never as { chargeUsage: never }).chargeUsage,
      first.sims,
      first.arrears,
    );

    await Promise.all([first.service.run(), second.run()]);

    expect(first.wallet.ledger).toHaveLength(1);
  });

  it('logs insufficient funds once per tenant and keeps sweeping', async () => {
    const { service, wallet, sims } = await build({ poor: 0, rich: 1_000_000 });
    await sims.save(sim('1', 'poor'));
    await sims.save(sim('2', 'rich'));
    const warn = vi.spyOn((service as never as { logger: { warn: () => void } }).logger, 'warn');

    expect(await service.run()).toEqual({ tenants: 2, charged: 1 });
    await service.run();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('poor:insufficient_funds');
    expect(wallet.ledger).toHaveLength(1);
  });

  it('records one arrear for an unpaid month and none for a paid one', async () => {
    const { service, sims, arrears } = await build({ poor: 0, rich: 1_000_000 });
    await sims.save(sim('1', 'poor'));
    await sims.save(sim('2', 'poor'));
    await sims.save(sim('3', 'rich'));

    await service.run();
    await service.run();

    expect(arrears.arrears).toHaveLength(1);
    expect(arrears.arrears[0]).toMatchObject({
      tenantId: 'poor',
      quantity: 2,
      amountKobo: 100_000,
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
      reference: expect.stringMatching(/^sim-monthly:poor:\d{4}-\d{2}$/),
    });
  });
});

describe('active SIM aggregate', () => {
  it('counts active SIMs per tenant, ignoring other statuses and unowned SIMs', async () => {
    const sims = new InMemorySimRepository();
    await sims.save(sim('1', 'a'));
    await sims.save(sim('2', 'a'));
    await sims.save(sim('3', 'b'));
    await sims.save(sim('4', 'b', 'assigned'));
    await sims.save(sim('5', null));

    const counts = await sims.countActiveByTenant();

    expect(counts).toHaveLength(2);
    expect(counts).toEqual(
      expect.arrayContaining([
        { tenantId: 'a', activeSims: 2 },
        { tenantId: 'b', activeSims: 1 },
      ]),
    );
  });
});

describe('advisory lock helper', () => {
  function fakeOrm(locked: boolean) {
    const calls: string[] = [];
    const client = {};
    const knex = {
      raw: (sql: string) => ({
        connection: async (conn: unknown) => {
          expect(conn).toBe(client);
          calls.push(sql);
          return { rows: [{ locked }] };
        },
      }),
      client: {
        acquireConnection: async () => client,
        releaseConnection: async () => calls.push('release'),
      },
    };
    return { calls, orm: { em: { getConnection: () => ({ getKnex: () => knex }) } } as never };
  }

  it('runs the task and unlocks on the same connection', async () => {
    const { orm, calls } = fakeOrm(true);
    const result = await runIfLockFree(orm, 1, async () => 'done');
    expect(result).toEqual({ acquired: true, value: 'done' });
    expect(calls).toEqual([
      'select pg_try_advisory_lock(?) as locked',
      'select pg_advisory_unlock(?)',
      'release',
    ]);
  });

  it('skips the task when another session holds the lock', async () => {
    const { orm, calls } = fakeOrm(false);
    const task = vi.fn();
    expect(await runIfLockFree(orm, 1, task)).toEqual({ acquired: false });
    expect(task).not.toHaveBeenCalled();
    expect(calls).toEqual(['select pg_try_advisory_lock(?) as locked', 'release']);
  });
});
