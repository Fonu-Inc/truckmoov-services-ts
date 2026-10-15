import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({ resolveActorUser: vi.fn(async (token: string) => ({ tenantId: token })) }),
);

import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { AllocateBundleUseCase } from "../../apps/auth/src/allocate-bundle.use-case";
import { MikroBundleAllocationRepository } from "../../apps/auth/src/mikro-bundle-allocation.repository";
import { MikroBundleCatalogRepository } from "../../apps/auth/src/mikro-bundle-catalog.repository";
import { MikroBundleTransactionRepository } from "../../apps/auth/src/mikro-bundle-transaction.repository";
import { MikroTenantWalletRepository } from "../../apps/auth/src/mikro-tenant-wallet.repository";
import { MikroWalletLedgerRepository } from "../../apps/auth/src/mikro-wallet-ledger.repository";
import { MikroSpendingLimitRepository } from "../../apps/auth/src/mikro-spending-limit.repository";
import { SpendingLimitService } from "../../apps/auth/src/spending-limit.service";
import type { StoredBundleAllocation } from "../../apps/auth/src/bundle-allocation.repository";

const PRICE = 1000;
const RETRY_MESSAGE = "use a new idempotency key";

class FailingAllocations extends MikroBundleAllocationRepository {
  activeSaves = 0;
  constructor(config: any, private failOnActiveSave: number) {
    super(config);
  }
  override async save(a: StoredBundleAllocation): Promise<void> {
    if (a.status === "active" && ++this.activeSaves >= this.failOnActiveSave) {
      throw new Error("allocation persistence failed");
    }
    return super.save(a);
  }
}

describe.skipIf(!dbEnabled)("bundles purchase (db)", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const bundleId = uniqueId("bundles-b");
  const wallets = new MikroTenantWalletRepository(config);
  const allocations = new MikroBundleAllocationRepository(config);
  const transactions = new MikroBundleTransactionRepository(config);
  const catalog = {
    findById: async (id: string) =>
      id === bundleId
        ? { id: bundleId, code: bundleId, name: "Test 1GB", carrierId: "c", dataAmountGb: 1, validityDays: 30, billingCycle: "monthly", priceKobo: PRICE, currency: "NGN", active: true, createdAt: new Date(), updatedAt: new Date() }
        : null,
  } as any;
  const limit = new SpendingLimitService(new MikroSpendingLimitRepository(config), { publish: async () => {} } as any);
  const carriers = { findById: async (id: string) => (id === "c" ? { id: "c", name: "Test", active: true } : null) } as any;
  const sims = { findByMsisdns: async (_t: string, msisdns: string[]) => msisdns.map((msisdn) => ({ msisdn })) } as any;
  let orm: Awaited<ReturnType<typeof getOrm>>;

  const build = (allocRepo: MikroBundleAllocationRepository = allocations) =>
    new AllocateBundleUseCase({} as any, {} as any, catalog, wallets, allocRepo, transactions, limit, carriers, sims, new MikroWalletLedgerRepository(config));

  async function fundedTenant(balanceKobo: number) {
    const tenantId = uniqueId("bundles-t");
    await wallets.ensure(tenantId);
    await wallets.credit(tenantId, balanceKobo, {
      category: "top_up", quantity: 1, unitRateKobo: balanceKobo, reason: "seed", idempotencyKey: `seed:${tenantId}`,
    });
    return tenantId;
  }

  const balance = async (t: string) => (await wallets.findByTenantId(t))!.balanceKobo;
  const ledger = (t: string) =>
    orm.em.getConnection().execute<any[]>("select direction, category, amount_kobo, idempotency_key from wallet_ledger_entries where tenant_id = ? and category <> 'top_up' order by created_at", [t]);
  const payload = (extra: Record<string, unknown> = {}) => ({
    carrierId: "c", planType: "p", bundleId, mobileNumbers: ["2348000000001"], ...extra,
  });

  beforeAll(async () => {
    orm = await getOrm();
  });
  afterAll(async () => {
    await orm.close();
  });

  it("findByPaymentReference returns mapped allocations", async () => {
    const tenantId = await fundedTenant(10 * PRICE);
    const key = uniqueId("bundles-k");
    const res = await build().execute(tenantId, payload({ idempotencyKey: key, mobileNumbers: ["2348000000001", "2348000000002"] }));
    const found = await allocations.findByPaymentReference(tenantId, key);
    expect(found.map((a) => a.id)).toEqual(res.data.allocationIds);
    expect(found).toHaveLength(2);
    for (const a of found) {
      expect(a).toMatchObject({ tenantId, bundleId, status: "active", paymentReference: key, dataUsedMb: 0, dataTotalMb: 1024 });
      expect(a.createdAt).toBeInstanceOf(Date);
      expect(a.expiresAt).toBeInstanceOf(Date);
      expect(a.mobileNumber).toMatch(/^23480000000/);
    }
    expect(await allocations.findByPaymentReference(tenantId, "nope")).toEqual([]);
    expect(await allocations.findByPaymentReference("other-tenant", key)).toEqual([]);
  });

  it("findAll and findExpiringWithin return mapped rows", async () => {
    const tenantId = await fundedTenant(10 * PRICE);
    const key = uniqueId("bundles-k");
    await build().execute(tenantId, payload({ idempotencyKey: key }));
    const all = await allocations.findAll({ tenantId });
    expect(all.total).toBe(1);
    expect(all.items[0]).toMatchObject({ tenantId, bundleId, status: "active", paymentReference: key });
    expect(all.items[0].mobileNumber).toBe("2348000000001");
    const expiring = await allocations.findExpiringWithin(tenantId, 60);
    expect(expiring).toHaveLength(1);
    expect(expiring[0]).toMatchObject({ tenantId, bundleId });
    const txs = await transactions.findAll({ tenantId });
    expect(txs.total).toBe(1);
    expect(txs.items[0]).toMatchObject({ tenantId, bundleId, amountKobo: PRICE, status: "success", paymentReference: key });
  });

  it("repeated purchase with same key debits once and returns original allocations", async () => {
    const tenantId = await fundedTenant(5 * PRICE);
    const key = uniqueId("bundles-k");
    const first = await build().execute(tenantId, payload({ idempotencyKey: key }));
    const second = await build().execute(tenantId, payload({ idempotencyKey: key }));
    expect(second.data.allocationIds).toEqual(first.data.allocationIds);
    expect(await balance(tenantId)).toBe(4 * PRICE);
    expect(await allocations.findByPaymentReference(tenantId, key)).toHaveLength(1);
    const rows = await ledger(tenantId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_kobo)).toBe(PRICE);
    const txs = await transactions.findAll({ tenantId });
    expect(txs.total).toBe(1);
  });

  it("failure after debit refunds once, leaves no active allocation, retry refused", async () => {
    const tenantId = await fundedTenant(5 * PRICE);
    const key = uniqueId("bundles-k");
    const failing = new FailingAllocations(config, 1);
    await expect(build(failing).execute(tenantId, payload({ idempotencyKey: key }))).rejects.toThrow("allocation persistence failed");
    expect(await balance(tenantId)).toBe(5 * PRICE);
    const rows = await ledger(tenantId);
    expect(rows.map((r) => r.direction)).toEqual(["debit", "credit"]);
    expect(rows.filter((r) => r.category === "refund")).toHaveLength(1);
    const found = await allocations.findByPaymentReference(tenantId, key);
    expect(found.filter((a) => a.status === "active")).toHaveLength(0);

    await expect(build().execute(tenantId, payload({ idempotencyKey: key }))).rejects.toThrow(RETRY_MESSAGE);
    await expect(build().execute(tenantId, payload({ idempotencyKey: key }))).rejects.toThrow(RETRY_MESSAGE);
    expect(await balance(tenantId)).toBe(5 * PRICE);
    expect(await ledger(tenantId)).toHaveLength(2);
  });

  it("partial failure on second SIM cancels the first and refunds the full amount once", async () => {
    const tenantId = await fundedTenant(5 * PRICE);
    const key = uniqueId("bundles-k");
    const failing = new FailingAllocations(config, 2);
    const p = payload({ idempotencyKey: key, mobileNumbers: ["2348000000001", "2348000000002"] });
    await expect(build(failing).execute(tenantId, p)).rejects.toThrow("allocation persistence failed");
    const found = await allocations.findByPaymentReference(tenantId, key);
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe("cancelled");
    expect(await balance(tenantId)).toBe(5 * PRICE);
    const rows = await ledger(tenantId);
    expect(rows.filter((r) => r.category === "refund")).toHaveLength(1);
    expect(Number(rows[1].amount_kobo)).toBe(2 * PRICE);
    await expect(build().execute(tenantId, p)).rejects.toThrow(RETRY_MESSAGE);
    expect(await balance(tenantId)).toBe(5 * PRICE);
  });

  it("concurrent same-key purchases debit once", async () => {
    const tenantId = await fundedTenant(10 * PRICE);
    const key = uniqueId("bundles-k");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => build().execute(tenantId, payload({ idempotencyKey: key }))),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBeGreaterThan(0);
    expect(await balance(tenantId)).toBe(9 * PRICE);
    const debits = (await ledger(tenantId)).filter((r) => r.direction === "debit");
    expect(debits).toHaveLength(1);
    const active = (await allocations.findByPaymentReference(tenantId, key)).filter((a) => a.status === "active");
    expect(active).toHaveLength(1);
    for (const r of fulfilled) expect(r.value.data.allocationIds).toEqual([active[0].id]);
    const txs = await transactions.findAll({ tenantId });
    expect(txs.total).toBe(1);
  });

  it("purchases without a key still work and each debits", async () => {
    const tenantId = await fundedTenant(5 * PRICE);
    const a = await build().execute(tenantId, payload());
    const b = await build().execute(tenantId, payload());
    expect(a.data.allocationIds[0]).not.toEqual(b.data.allocationIds[0]);
    expect(await balance(tenantId)).toBe(3 * PRICE);
    expect((await allocations.findAll({ tenantId })).total).toBe(2);
  });

  it("insufficient balance leaves nothing behind", async () => {
    const tenantId = await fundedTenant(PRICE - 1);
    const key = uniqueId("bundles-k");
    await expect(build().execute(tenantId, payload({ idempotencyKey: key }))).rejects.toThrow("Wallet balance does not cover");
    expect(await balance(tenantId)).toBe(PRICE - 1);
    expect(await allocations.findByPaymentReference(tenantId, key)).toEqual([]);
  });

  it("real catalog repository prices a purchase end to end", async () => {
    const realCatalog = new MikroBundleCatalogRepository(config);
    const id = uniqueId("bundles-cat");
    await realCatalog.save({ id, code: id, name: "Real 2GB", carrierId: "c", dataAmountGb: 2.5, validityDays: 7, billingCycle: "monthly", priceKobo: 250000, currency: "NGN", active: true, createdAt: new Date(), updatedAt: new Date() });
    const found = await realCatalog.findById(id);
    expect(Number(found!.priceKobo)).toBe(250000);
    const tenantId = await fundedTenant(1_000_000);
    const uc = new AllocateBundleUseCase({} as any, {} as any, realCatalog, wallets, allocations, transactions, limit, carriers, sims, new MikroWalletLedgerRepository(config));
    const key = uniqueId("bundles-k");
    const res = await uc.execute(tenantId, { carrierId: "c", planType: "p", bundleId: id, mobileNumbers: ["2348000000009"], idempotencyKey: key });
    expect(res.data.totalAmount).toBe(2500);
    expect(await balance(tenantId)).toBe(750000);
    const [a] = await allocations.findByPaymentReference(tenantId, key);
    expect(a.dataTotalMb).toBe(2560);
    const all = await realCatalog.findAll({ search: id });
    expect(all.items.map((b) => b.id)).toEqual([id]);
  });
});
