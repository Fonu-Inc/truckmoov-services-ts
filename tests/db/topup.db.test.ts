import { randomUUID } from "node:crypto";
import type { MikroORM } from "@mikro-orm/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroWalletTopUpRepository } from "../../apps/auth/src/mikro-wallet-top-up.repository";
import { MikroTenantWalletRepository } from "../../apps/auth/src/mikro-tenant-wallet.repository";
import { MikroWalletLedgerRepository } from "../../apps/auth/src/mikro-wallet-ledger.repository";
import { SettleWalletTopUpUseCase } from "../../apps/auth/src/settle-wallet-top-up.use-case";
import { TopupWalletUseCase } from "../../apps/auth/src/topup-wallet.use-case";
import { PlatformTopUpWalletUseCase } from "../../apps/auth/src/platform-wallet.use-cases";
import type { StoredWalletTopUp, WalletTopUpRepository } from "../../apps/auth/src/wallet-top-up.repository";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

const config = { db: dbEnabled ? getConfig() : undefined } as never;
const NGN = (amountKobo: number) => ({ amountKobo, currency: "NGN" }) as never;

function topUpRow(tenantId: string, over: Partial<StoredWalletTopUp> = {}): StoredWalletTopUp {
  return {
    id: randomUUID(),
    tenantId,
    amountKobo: 500_000,
    provider: "paystack",
    mobileNumber: "08000000000",
    status: "pending",
    reference: uniqueId("topup-ref"),
    settledAt: null,
    createdAt: new Date(),
    ...over,
  };
}

describe.skipIf(!dbEnabled)("wallet top-up on real repositories", () => {
  let orm: MikroORM;
  let topUps: MikroWalletTopUpRepository;
  let wallets: MikroTenantWalletRepository;
  let ledger: MikroWalletLedgerRepository;
  let settle: SettleWalletTopUpUseCase;

  const balance = async (tenantId: string) => (await wallets.findByTenantId(tenantId))?.balanceKobo ?? null;

  beforeAll(async () => {
    orm = await getOrm();
    topUps = new MikroWalletTopUpRepository(config);
    wallets = new MikroTenantWalletRepository(config);
    ledger = new MikroWalletLedgerRepository(config);
    settle = new SettleWalletTopUpUseCase(topUps, wallets, { raise: async () => {} } as never);
  });

  afterAll(async () => {
    await orm?.close();
  });

  it("maps snake_case columns and bigint to the stored shape", async () => {
    const tenantId = uniqueId("topup");
    const big = 9_007_199_254_740_000;
    const row = topUpRow(tenantId, { amountKobo: big });
    await topUps.save(row);

    const byRef = await topUps.findByReference(row.reference!);
    expect(byRef).toMatchObject({
      id: row.id,
      tenantId,
      amountKobo: big,
      provider: "paystack",
      mobileNumber: "08000000000",
      status: "pending",
      reference: row.reference,
      settledAt: null,
    });
    expect(typeof byRef!.amountKobo).toBe("number");
    expect(byRef!.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(byRef!.createdAt.getTime())).toBe(false);

    const [listed] = await topUps.findAllByTenantId(tenantId);
    expect(listed).toEqual(byRef);
    expect(Object.keys(listed!)).not.toContain("tenant_id");
  });

  it("sums and counts successful top-ups only", async () => {
    const tenantId = uniqueId("topup");
    const a = topUpRow(tenantId, { amountKobo: 100_000 });
    const b = topUpRow(tenantId, { amountKobo: 250_000 });
    const c = topUpRow(tenantId, { amountKobo: 999_000 });
    for (const r of [a, b, c]) await topUps.save(r);
    await topUps.markSettled(a.id, new Date());
    await topUps.markSettled(b.id, new Date());

    expect(await topUps.sumSuccessfulByTenantId(tenantId)).toBe(350_000);
    expect(await topUps.countSuccessfulByTenantId(tenantId)).toBe(2);
    const settled = await topUps.findByReference(a.reference!);
    expect(settled!.status).toBe("success");
    expect(settled!.settledAt).toBeInstanceOf(Date);
  });

  it("credits once under 10 concurrent deliveries", async () => {
    const tenantId = uniqueId("topup");
    const row = topUpRow(tenantId);
    await topUps.save(row);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => settle.execute(row.reference!, NGN(row.amountKobo))),
    );

    expect(results.filter((r) => r.outcome === "credited")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_settled")).toHaveLength(9);
    expect(await balance(tenantId)).toBe(row.amountKobo);
    const { items } = await ledger.list(tenantId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: "top_up", direction: "credit", amountKobo: row.amountKobo });
  });

  it("recovers when the process crashes between credit and markSettled", async () => {
    const tenantId = uniqueId("topup");
    const row = topUpRow(tenantId);
    await topUps.save(row);

    let failed = false;
    const flaky: WalletTopUpRepository = {
      findAllByTenantId: (t) => topUps.findAllByTenantId(t),
      findByReference: (r) => topUps.findByReference(r),
      sumSuccessfulByTenantId: (t) => topUps.sumSuccessfulByTenantId(t),
      countSuccessfulByTenantId: (t) => topUps.countSuccessfulByTenantId(t),
      save: (t) => topUps.save(t),
      markSettled: async (id, at) => {
        if (!failed) {
          failed = true;
          throw new Error("crash");
        }
        return topUps.markSettled(id, at);
      },
    };
    const crashing = new SettleWalletTopUpUseCase(flaky, wallets, { raise: async () => {} } as never);

    await expect(crashing.execute(row.reference!, NGN(row.amountKobo))).rejects.toThrow("crash");
    expect(await balance(tenantId)).toBe(row.amountKobo);
    expect((await topUps.findByReference(row.reference!))!.status).toBe("pending");

    const retry = await crashing.execute(row.reference!, NGN(row.amountKobo));
    expect(retry.outcome).toBe("credited");
    expect(await balance(tenantId)).toBe(row.amountKobo);
    expect((await topUps.findByReference(row.reference!))!.status).toBe("success");
    expect((await ledger.list(tenantId)).items).toHaveLength(1);

    expect((await settle.execute(row.reference!, NGN(row.amountKobo))).outcome).toBe("already_settled");
    expect(await balance(tenantId)).toBe(row.amountKobo);
  });

  it("creates and credits a wallet for a tenant without one", async () => {
    const tenantId = uniqueId("topup");
    expect(await wallets.findByTenantId(tenantId)).toBeNull();
    const row = topUpRow(tenantId, { amountKobo: 123_456 });
    await topUps.save(row);

    expect((await settle.execute(row.reference!, NGN(123_456))).outcome).toBe("credited");
    const wallet = await wallets.findByTenantId(tenantId);
    expect(wallet).toMatchObject({ balanceKobo: 123_456, currency: "NGN" });
  });

  it("credits nothing on amount or currency mismatch, and not_found for unknown reference", async () => {
    const tenantId = uniqueId("topup");
    const row = topUpRow(tenantId);
    await topUps.save(row);

    expect((await settle.execute(row.reference!, NGN(row.amountKobo - 1))).outcome).toBe("amount_mismatch");
    expect((await settle.execute(row.reference!, { amountKobo: row.amountKobo, currency: "USD" } as never)).outcome).toBe(
      "amount_mismatch",
    );
    expect((await settle.execute(row.reference!)).outcome).toBe("amount_mismatch");
    expect((await settle.execute(uniqueId("missing"), NGN(1))).outcome).toBe("not_found");

    expect(await wallets.findByTenantId(tenantId)).toBeNull();
    expect((await ledger.list(tenantId)).total).toBe(0);
    expect((await topUps.findByReference(row.reference!))!.status).toBe("pending");
  });

  describe("platform goodwill credit", () => {
    const actor = { id: uniqueId("topup-staff"), email: "ops@truckmoov.com", role: "SYSTEM_ADMIN" };
    const logged: unknown[] = [];
    const platform = () =>
      new PlatformTopUpWalletUseCase(
        { resolveAccessToken: () => ({ sub: actor.id, tenantId: "system", role: actor.role }) } as never,
        { findById: async () => ({ ...actor, status: "active", tenantId: "system" }) } as never,
        wallets,
        { record: async (e: unknown) => void logged.push(e) } as never,
      );

    it("uses goodwill category and stays out of top_up totals", async () => {
      const tenantId = uniqueId("topup");
      const row = topUpRow(tenantId, { amountKobo: 200_000 });
      await topUps.save(row);
      await settle.execute(row.reference!, NGN(200_000));

      const out = await platform().execute({
        accessToken: "t",
        tenantId,
        amountKobo: 70_000,
        reason: "goodwill",
        idempotencyKey: uniqueId("k"),
      });
      expect(out.balanceAfterKobo).toBe(270_000);

      expect(await ledger.sum(tenantId, { category: "goodwill" } as never)).toBe(70_000);
      expect(await ledger.sum(tenantId, { category: "top_up" } as never)).toBe(200_000);
      expect(await topUps.sumSuccessfulByTenantId(tenantId)).toBe(200_000);
      expect(await topUps.countSuccessfulByTenantId(tenantId)).toBe(1);
    });

    it("creates a wallet for a tenant without one", async () => {
      const tenantId = uniqueId("topup");
      await platform().execute({ accessToken: "t", tenantId, amountKobo: 5_000, reason: "bank transfer" });
      expect(await balance(tenantId)).toBe(5_000);
      expect(await topUps.sumSuccessfulByTenantId(tenantId)).toBe(0);
    });

    it("same idempotency key twice credits once", async () => {
      const tenantId = uniqueId("topup");
      const idempotencyKey = uniqueId("k");
      const cmd = { accessToken: "t", tenantId, amountKobo: 40_000, reason: "dup", idempotencyKey };
      const [a, b] = await Promise.all([platform().execute(cmd), platform().execute(cmd)]);
      const c = await platform().execute(cmd);

      expect(a.balanceAfterKobo).toBe(40_000);
      expect(b.balanceAfterKobo).toBe(40_000);
      expect(c.balanceAfterKobo).toBe(40_000);
      expect(await balance(tenantId)).toBe(40_000);
      expect((await ledger.list(tenantId)).total).toBe(1);
    });
  });

  describe("TopupWalletUseCase", () => {
    it("records a pending row before charging and settles it", async () => {
      const tenantId = uniqueId("topup");
      let seenAtCharge: StoredWalletTopUp | null = null;
      const gateway = {
        name: "fake",
        initiateCharge: async (req: { reference: string }) => {
          seenAtCharge = await topUps.findByReference(req.reference);
          return { authorizationUrl: "https://pay.example/x" };
        },
      };
      const useCase = new TopupWalletUseCase(
        { resolveAccessToken: () => ({ sub: "u1", tenantId, role: "TENANT_ADMIN" }) } as never,
        { findById: async () => ({ id: "u1", email: "a@b.co", status: "active", tenantId, role: "TENANT_ADMIN" }) } as never,
        topUps,
        { get: async () => null } as never,
        gateway as never,
      );

      const out = await useCase.execute("t", { amount: 5000, mobileMoneyProvider: "paystack", mobileNumber: "0800" });
      expect(seenAtCharge).toMatchObject({ status: "pending", tenantId, amountKobo: 500_000 });

      const ref = out.data.paymentReference;
      expect((await settle.execute(ref, NGN(500_000))).outcome).toBe("credited");
      expect(await balance(tenantId)).toBe(500_000);
      expect((await topUps.findAllByTenantId(tenantId))[0]).toMatchObject({ status: "success", amountKobo: 500_000 });
    });
  });
});
