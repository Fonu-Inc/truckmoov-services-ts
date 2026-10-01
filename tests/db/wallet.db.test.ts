import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EntityManager } from "@mikro-orm/core";
import type { MikroORM } from "@mikro-orm/postgresql";
import { MikroTenantWalletRepository } from "../../apps/auth/src/mikro-tenant-wallet.repository";
import { MikroWalletLedgerRepository } from "../../apps/auth/src/mikro-wallet-ledger.repository";
import { WalletLedgerEntryRecord } from "../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm";
import type { WalletLedgerDraft } from "../../apps/auth/src/wallet-ledger.repository";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

const draft = (over: Partial<WalletLedgerDraft> = {}): WalletLedgerDraft => ({
  category: "top_up",
  quantity: 1,
  unitRateKobo: 0,
  reason: "wallet slice test",
  ...over,
});

describe.skipIf(!dbEnabled)("wallet ledger idempotency on postgres", () => {
  let orm: MikroORM;
  let wallets: MikroTenantWalletRepository;
  let ledger: MikroWalletLedgerRepository;

  const newTenant = async () => {
    const tenantId = uniqueId(`wallet-${randomUUID().slice(0, 8)}`);
    await wallets.ensure(tenantId);
    return tenantId;
  };

  const rows = (tenantId: string) =>
    orm.em.getConnection().execute(
      "select direction, amount_kobo, balance_after_kobo from wallet_ledger_entries where tenant_id = ? order by seq",
      [tenantId],
    ) as Promise<Array<{ direction: string; amount_kobo: string; balance_after_kobo: string }>>;

  beforeAll(async () => {
    orm = await getOrm();
    const cfg = { db: getConfig() } as never;
    wallets = new MikroTenantWalletRepository(cfg);
    ledger = new MikroWalletLedgerRepository(cfg);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await orm?.close();
  });

  it("applies first call and replays the second without moving money", async () => {
    const t = await newTenant();
    const first = await wallets.credit(t, 5_000, draft({ idempotencyKey: "k1" }));
    const second = await wallets.credit(t, 5_000, draft({ idempotencyKey: "k1" }));
    expect(first).toMatchObject({ ok: true, replayed: false, balanceAfterKobo: 5_000 });
    expect(second).toMatchObject({ ok: true, replayed: true, balanceAfterKobo: 5_000 });
    expect(second.entry?.id).toBe(first.entry?.id);
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(5_000);
    expect(await rows(t)).toHaveLength(1);
  });

  it("scopes keys per tenant", async () => {
    const a = await newTenant();
    const b = await newTenant();
    await wallets.credit(a, 100, draft({ idempotencyKey: "shared" }));
    const r = await wallets.credit(b, 100, draft({ idempotencyKey: "shared" }));
    expect(r.replayed).toBe(false);
  });

  it("replays a debit the wallet could no longer cover", async () => {
    const t = await newTenant();
    await wallets.credit(t, 1_000, draft());
    const debit = await wallets.debit(t, 1_000, draft({ category: "sms", idempotencyKey: "d1" }));
    expect(debit).toMatchObject({ ok: true, replayed: false, balanceAfterKobo: 0 });
    const replay = await wallets.debit(t, 1_000, draft({ category: "sms", idempotencyKey: "d1" }));
    expect(replay).toMatchObject({ ok: true, replayed: true, balanceAfterKobo: 0 });
    expect(replay.entry?.id).toBe(debit.entry?.id);
    const fresh = await wallets.debit(t, 1_000, draft({ category: "sms", idempotencyKey: "d2" }));
    expect(fresh).toMatchObject({ ok: false, entry: null });
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(0);
    expect(await rows(t)).toHaveLength(2);
  });

  it("20 concurrent same-key credits apply exactly once", async () => {
    const t = await newTenant();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => wallets.credit(t, 700, draft({ idempotencyKey: "storm" }))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.entry?.id)).size).toBe(1);
    expect(results.every((r) => r.balanceAfterKobo === 700)).toBe(true);
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(700);
    expect(await rows(t)).toHaveLength(1);
  });

  it("different keys all apply and balance equals ledger sum", async () => {
    const t = await newTenant();
    await wallets.credit(t, 100_000, draft());
    const ops = Array.from({ length: 30 }, (_, i) =>
      i % 3 === 0
        ? wallets.debit(t, 111, draft({ category: "sms", idempotencyKey: `k-${i}` }))
        : wallets.credit(t, 250 + i, draft({ idempotencyKey: `k-${i}` })),
    );
    const results = await Promise.all(ops);
    expect(results.every((r) => r.ok && !r.replayed)).toBe(true);
    const entries = await rows(t);
    expect(entries).toHaveLength(31);
    const sum = entries.reduce(
      (s, e) => s + (e.direction === "credit" ? 1 : -1) * Number(e.amount_kobo),
      0,
    );
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(sum);
    expect(Number(entries[entries.length - 1].balance_after_kobo)).toBe(sum);
    let running = 0;
    for (const e of entries) {
      running += (e.direction === "credit" ? 1 : -1) * Number(e.amount_kobo);
      expect(Number(e.balance_after_kobo)).toBe(running);
    }
  });

  it("falls back to the original entry on a unique violation", async () => {
    const t = await newTenant();
    const original = await wallets.credit(t, 900, draft({ idempotencyKey: "race" }));
    const realFindOne = EntityManager.prototype.findOne;
    let hidden = false;
    vi.spyOn(EntityManager.prototype, "findOne").mockImplementation(async function (
      this: EntityManager,
      entity: unknown,
      ...rest: unknown[]
    ) {
      if (entity === WalletLedgerEntryRecord && !hidden) {
        hidden = true;
        return null;
      }
      return (realFindOne as (...a: unknown[]) => unknown).call(this, entity, ...rest);
    } as never);
    const result = await wallets.credit(t, 900, draft({ idempotencyKey: "race" }));
    expect(hidden).toBe(true);
    expect(result).toMatchObject({ ok: true, replayed: true, balanceAfterKobo: 900 });
    expect(result.entry?.id).toBe(original.entry?.id);
    vi.restoreAllMocks();
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(900);
    expect(await rows(t)).toHaveLength(1);
  });

  it("findByIdempotencyKey finds the entry per tenant, else null", async () => {
    const t = await newTenant();
    const other = await newTenant();
    const done = await wallets.credit(t, 321, draft({ idempotencyKey: "find-me" }));
    const found = await ledger.findByIdempotencyKey(t, "find-me");
    expect(found).toMatchObject({ id: done.entry?.id, amountKobo: 321, idempotencyKey: "find-me" });
    expect(await ledger.findByIdempotencyKey(other, "find-me")).toBeNull();
    expect(await ledger.findByIdempotencyKey(t, "nope")).toBeNull();
  });

  it("treats blank keys as none", async () => {
    const t = await newTenant();
    const results = [
      await wallets.credit(t, 10, draft({ idempotencyKey: "" })),
      await wallets.credit(t, 10, draft({ idempotencyKey: "   " })),
      await wallets.credit(t, 10, draft({ idempotencyKey: null })),
      await wallets.credit(t, 10, draft()),
    ];
    expect(results.every((r) => r.ok && !r.replayed)).toBe(true);
    expect((await wallets.findByTenantId(t))?.balanceKobo).toBe(40);
    const stored = (await orm.em
      .getConnection()
      .execute("select idempotency_key from wallet_ledger_entries where tenant_id = ?", [t])) as Array<{
      idempotency_key: string | null;
    }>;
    expect(stored.every((r) => r.idempotency_key === null)).toBe(true);
  });

  it("trims keys so padded duplicates replay", async () => {
    const t = await newTenant();
    await wallets.credit(t, 10, draft({ idempotencyKey: "pad" }));
    const r = await wallets.credit(t, 10, draft({ idempotencyKey: "  pad  " }));
    expect(r.replayed).toBe(true);
  });

  it("rejects keys longer than the column before moving money", async () => {
    const t = await newTenant();
    await expect(wallets.credit(t, 10, draft({ idempotencyKey: "x".repeat(161) }))).rejects.toThrow();
    expect(await rows(t)).toHaveLength(0);
  });

  it("stores and filters the goodwill category", async () => {
    const t = await newTenant();
    await wallets.credit(t, 500, draft({ category: "goodwill", reason: "sorry" }));
    await wallets.credit(t, 300, draft({ category: "top_up" }));
    const { items, total } = await ledger.list(t, { category: "goodwill" });
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ category: "goodwill", amountKobo: 500, reason: "sorry" });
    expect(await ledger.sum(t, { category: "goodwill" })).toBe(500);
    const across = await ledger.listAcrossTenants({ tenantId: t, category: "goodwill" });
    expect(across.total).toBe(1);
  });

  it("round-trips amounts above 2^31 kobo as numbers", async () => {
    const t = await newTenant();
    const big = 5_000_000_000;
    const credit = await wallets.credit(t, big, draft({ idempotencyKey: "big" }));
    expect(credit.balanceAfterKobo).toBe(big);
    expect(typeof credit.entry?.amountKobo).toBe("number");
    const debit = await wallets.debit(t, 2_147_483_649, draft({ category: "sms" }));
    expect(debit.balanceAfterKobo).toBe(big - 2_147_483_649);
    const wallet = await wallets.findByTenantId(t);
    expect(wallet?.balanceKobo).toBe(big - 2_147_483_649);
    expect(typeof wallet?.balanceKobo).toBe("number");
    const found = await ledger.findByIdempotencyKey(t, "big");
    expect(found?.amountKobo).toBe(big);
    expect(found?.balanceAfterKobo).toBe(big);
    expect(await ledger.sum(t)).toBe(big + 2_147_483_649);
    await wallets.save({ ...(wallet as NonNullable<typeof wallet>), creditLimitKobo: 3_000_000_000 });
    expect((await wallets.findByTenantId(t))?.creditLimitKobo).toBe(3_000_000_000);
  });
});
