import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { runIfLockFree } from "@shared/db";
import { ChargeUsageUseCase } from "../../apps/auth/src/charge-usage.use-case";
import { CommunicationRateService } from "../../apps/auth/src/communication-rate.service";
import { EntitlementService } from "../../apps/auth/src/entitlement.service";
import { MikroCommunicationRatesRepository } from "../../apps/auth/src/mikro-communication-rates.repository";
import { MikroPlanEntitlementsRepository } from "../../apps/auth/src/mikro-plan-entitlements.repository";
import { MikroSimRepository } from "../../apps/auth/src/mikro-sim.repository";
import { MikroTenantWalletRepository } from "../../apps/auth/src/mikro-tenant-wallet.repository";
import { MikroWalletLedgerRepository } from "../../apps/auth/src/mikro-wallet-ledger.repository";
import { SimRecurringChargeService } from "../../apps/auth/src/sim-recurring-charge.service";
import type { SimRepository } from "../../apps/auth/src/sim.repository";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

const SIM_SWEEP_LOCK_ID = 8_246_113_070_002;
const RATE_KOBO = 50_000;
const pgArray = (values: string[]) => `{${values.join(",")}}`;
type Row = Record<string, unknown>;

describe.skipIf(!dbEnabled)("sim monthly charge on real postgres", () => {
  let orm: MikroORM;
  const suffix = randomUUID().slice(0, 8);
  const tenants: string[] = [];

  const query = (sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const newTenant = (): string => {
    const id = uniqueId(`sim-${suffix}`);
    tenants.push(id);
    return id;
  };

  const fund = (tenantId: string, balanceKobo: number) =>
    query(
      `insert into tenant_wallets (tenant_id, balance_kobo) values (?, ?)
       on conflict (tenant_id) do update set balance_kobo = excluded.balance_kobo`,
      [tenantId, balanceKobo],
    );

  const addSims = (tenantId: string | null, count: number, status = "active") =>
    query(
      `insert into iot_sims (id, iccid, carrier, status, tenant_id)
       select ?::text || '-' || g, left(md5(?::text || g::text || ?::text), 30), 'mtn', ?, ?
       from generate_series(1, ?::int) g`,
      [randomUUID(), randomUUID(), randomUUID(), status, tenantId, count],
    );

  const balance = async (tenantId: string) =>
    Number((await query(`select balance_kobo from tenant_wallets where tenant_id = ?`, [tenantId]))[0]?.balance_kobo);

  const debits = async (tenantId: string) =>
    query(
      `select amount_kobo, quantity, idempotency_key from wallet_ledger_entries
       where tenant_id = ? and direction = 'debit'`,
      [tenantId],
    );

  function buildService(sims: SimRepository = new MikroSimRepository(config())) {
    const cfg = config();
    const rates = new MikroCommunicationRatesRepository(cfg);
    const planRepo = new MikroPlanEntitlementsRepository(cfg);
    const wallet = new MikroTenantWalletRepository(cfg);
    const chargeUsage = new ChargeUsageUseCase(
      new CommunicationRateService(rates),
      { assertWithinLimit: async () => {} } as never,
      { afterDebit: async () => {} } as never,
      wallet,
      new EntitlementService(planRepo),
      planRepo,
      new MikroWalletLedgerRepository(cfg),
    );
    return new SimRecurringChargeService(cfg, chargeUsage, sims);
  }

  function config() {
    return { persistence: { backend: "mikro-orm" }, db: getConfig() } as never;
  }

  async function cleanup() {
    if (tenants.length === 0) return;
    await query(`delete from iot_sims where tenant_id = any(?::text[])`, [pgArray(tenants)]);
    await query(`delete from wallet_ledger_entries where tenant_id = any(?::text[])`, [pgArray(tenants)]);
    await query(`delete from tenant_wallets where tenant_id = any(?::text[])`, [pgArray(tenants)]);
    tenants.length = 0;
  }

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await orm?.close();
  });

  describe("countActiveByTenant", () => {
    it("counts only active sims, excludes null tenant", async () => {
      const a = newTenant();
      const b = newTenant();
      const onlyInactive = newTenant();
      await addSims(a, 3);
      await addSims(a, 2, "suspended");
      await addSims(a, 1, "registered");
      await addSims(b, 1);
      await addSims(onlyInactive, 4, "terminated");
      await addSims(null, 5);

      const counts = await new MikroSimRepository(config()).countActiveByTenant();
      const mine = counts.filter((c) => tenants.includes(c.tenantId));

      expect(mine).toHaveLength(2);
      expect(mine.find((c) => c.tenantId === a)?.activeSims).toBe(3);
      expect(mine.find((c) => c.tenantId === b)?.activeSims).toBe(1);
      expect(counts.every((c) => c.tenantId !== null)).toBe(true);
    });

    it("returns a number for large counts", async () => {
      const a = newTenant();
      await addSims(a, 20_000);

      const counts = await new MikroSimRepository(config()).countActiveByTenant();

      expect(counts.find((c) => c.tenantId === a)?.activeSims).toBe(20_000);
    });
  });

  describe("sweep", () => {
    it("two services started at the same instant charge each tenant once", async () => {
      const ids = [newTenant(), newTenant(), newTenant()];
      for (const [i, id] of ids.entries()) {
        await fund(id, 1_000_000);
        await addSims(id, i + 1);
      }

      await Promise.all([buildService().run(), buildService().run()]);

      for (const [i, id] of ids.entries()) {
        expect(await debits(id)).toHaveLength(1);
        expect(await balance(id)).toBe(1_000_000 - (i + 1) * RATE_KOBO);
      }
    });

    it("second sweep in same month charges nothing", async () => {
      const id = newTenant();
      await fund(id, 1_000_000);
      await addSims(id, 2);
      await addSims(id, 1, "suspended");

      const service = buildService();
      const first = await service.run();
      const second = await buildService().run();

      expect(first.charged).toBeGreaterThanOrEqual(1);
      expect(second.charged).toBe(0);
      const rows = await debits(id);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].amount_kobo)).toBe(2 * RATE_KOBO);
      expect(Number(rows[0].quantity)).toBe(2);
      expect(await balance(id)).toBe(1_000_000 - 2 * RATE_KOBO);
    });

    it("skips insufficient-funds tenant without blocking others", async () => {
      const poor = newTenant();
      const rich = newTenant();
      const noWallet = newTenant();
      await fund(poor, RATE_KOBO - 1);
      await fund(rich, 1_000_000);
      await addSims(poor, 1);
      await addSims(rich, 1);
      await addSims(noWallet, 1);

      await buildService().run();

      expect(await debits(poor)).toHaveLength(0);
      expect(await balance(poor)).toBe(RATE_KOBO - 1);
      expect(await debits(rich)).toHaveLength(1);
      expect(await debits(noWallet)).toHaveLength(0);
    });

    it("tenant that tops up is charged on a later sweep", async () => {
      const id = newTenant();
      await fund(id, 0);
      await addSims(id, 1);

      await buildService().run();
      expect(await debits(id)).toHaveLength(0);

      await fund(id, RATE_KOBO);
      await buildService().run();
      expect(await debits(id)).toHaveLength(1);
      expect(await balance(id)).toBe(0);
    });

    it("returns empty and charges nothing while another session holds the lock", async () => {
      const id = newTenant();
      await fund(id, 1_000_000);
      await addSims(id, 1);

      const held = await runIfLockFree(orm, SIM_SWEEP_LOCK_ID, async () => buildService().run());

      expect(held.acquired && held.value).toEqual({ tenants: 0, charged: 0 });
      expect(await debits(id)).toHaveLength(0);
    });

    it("releases lock after an error inside the task", async () => {
      const failing = buildService({
        countActiveByTenant: async () => {
          throw new Error("boom");
        },
      } as unknown as SimRepository);

      await expect(failing.run()).rejects.toThrow("boom");
      await expect(
        runIfLockFree(orm, SIM_SWEEP_LOCK_ID, async () => {
          throw new Error("direct");
        }),
      ).rejects.toThrow("direct");

      const probe = await runIfLockFree(orm, SIM_SWEEP_LOCK_ID, async () => "free");
      expect(probe).toEqual({ acquired: true, value: "free" });

      const id = newTenant();
      await fund(id, 1_000_000);
      await addSims(id, 1);
      await buildService().run();
      expect(await debits(id)).toHaveLength(1);
    });

    it("lock is free after a normal sweep", async () => {
      await buildService().run();
      expect(await runIfLockFree(orm, SIM_SWEEP_LOCK_ID, async () => 1)).toEqual({ acquired: true, value: 1 });
    });

    it("300 tenants complete quickly, once each", async () => {
      const ids = Array.from({ length: 300 }, () => newTenant());
      await query(
        `insert into tenant_wallets (tenant_id, balance_kobo) select unnest(?::text[]), 1000000`,
        [pgArray(ids)],
      );
      await query(
        `insert into iot_sims (id, iccid, carrier, status, tenant_id)
         select ?::text || '-' || t.n, left(md5(?::text || t.n::text), 30), 'mtn', 'active', t.id
         from unnest(?::text[]) with ordinality as t(id, n)`,
        [randomUUID(), randomUUID(), pgArray(ids)],
      );

      const started = Date.now();
      const result = await buildService().run();
      const elapsed = Date.now() - started;

      expect(result.charged).toBeGreaterThanOrEqual(300);
      expect(elapsed).toBeLessThan(30_000);
      const [{ n }] = await query(
        `select count(*)::int as n from wallet_ledger_entries where tenant_id = any(?::text[]) and direction = 'debit'`,
        [pgArray(ids)],
      );
      expect(n).toBe(300);

      await buildService().run();
      const [{ n: after }] = await query(
        `select count(*)::int as n from wallet_ledger_entries where tenant_id = any(?::text[]) and direction = 'debit'`,
        [pgArray(ids)],
      );
      expect(after).toBe(300);
    }, 60_000);
  });
});
