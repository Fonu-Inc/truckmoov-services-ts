import { describe, expect, it, vi } from "vitest";

// Bypass token/user resolution — we only exercise the wallet money path.
vi.mock(
  "../../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({
    resolveActorUser: vi.fn().mockResolvedValue({ tenantId: "t1" }),
  }),
);

import { AllocateBundleUseCase } from "../../../apps/auth/src/allocate-bundle.use-case";
import { InMemoryTenantWalletRepository } from "../../../apps/auth/src/in-memory-tenant-wallet.repository";
import { InMemoryBundleAllocationRepository } from "../../../apps/auth/src/in-memory-bundle-allocation.repository";
import { InMemoryBundleCarrierRepository } from "../../../apps/auth/src/in-memory-bundle-carrier.repository";
import { InMemoryBundleCatalogRepository } from "../../../apps/auth/src/in-memory-bundle-catalog.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { AllocationReferenceError, PurchaseRefundedError } from "../../../apps/auth/src/allocate-bundle.use-case";
import { InsufficientWalletBalanceError } from "../../../apps/auth/src/charge-usage.use-case";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";

// Every number resolves to one of the tenant's SIMs, so the money path is all that varies.
function anySims() {
  return {
    findByMsisdns: async (_tenantId: string, msisdns: string[]) => msisdns.map((msisdn) => ({ msisdn })),
  } as any;
}

function carrierC1() {
  return { findById: async (id: string) => (id === "c1" ? { id: "c1", name: "MTN", active: true } : null) } as any;
}

// No limit configured: allow every spend and record nothing.
function noSpendingLimit() {
  return { assertWithinLimit: async () => {}, recordSpend: async () => {} } as any;
}

function makeUseCase(wallet: InMemoryTenantWalletRepository) {
  const bundleCatalogRepository = {
    findById: vi.fn().mockResolvedValue({
      id: "b1",
      carrierId: "c1",
      priceKobo: 1000,
      dataAmountGb: 1,
      validityDays: 30,
      active: true,
    }),
  };
  const bundleAllocationRepository = new InMemoryBundleAllocationRepository();
  const bundleTransactionRepository = { save: vi.fn().mockResolvedValue(undefined) };

  return new AllocateBundleUseCase(
    {} as any,
    {} as any,
    bundleCatalogRepository as any,
    wallet,
    bundleAllocationRepository as any,
    bundleTransactionRepository as any,
    noSpendingLimit(),
    carrierC1(),
    anySims(),
  );
}

const payload = { carrierId: "c1", planType: "p", bundleId: "b1", mobileNumbers: ["234000"] };

function build(
  wallet: InMemoryTenantWalletRepository,
  allocations: InMemoryBundleAllocationRepository,
  transactions: { save: (t: any) => Promise<void> } = { save: vi.fn().mockResolvedValue(undefined) },
  limit: any = noSpendingLimit(),
) {
  const catalog = {
    findById: vi.fn().mockResolvedValue({ id: "b1", carrierId: "c1", name: "B", priceKobo: 1000, dataAmountGb: 1, validityDays: 30, active: true }),
  };
  return new AllocateBundleUseCase({} as any, {} as any, catalog as any, wallet, allocations as any, transactions as any, limit, carrierC1(), anySims());
}

describe("AllocateBundleUseCase — double-spend guard", () => {
  it("only one of two concurrent allocations succeeds when balance covers one", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });

    const useCase = makeUseCase(wallet);
    const payload = { carrierId: "c1", planType: "p", bundleId: "b1", mobileNumbers: ["234000"] };

    const results = await Promise.allSettled([
      useCase.execute("tok", payload),
      useCase.execute("tok", payload),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientWalletBalanceError);

    const after = await wallet.findByTenantId("t1");
    expect(after?.balanceKobo).toBe(0);
  });

  it("refunds once when persisting fails after the debit, and rethrows", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });
    const credit = vi.spyOn(wallet, "credit");
    const allocations = new InMemoryBundleAllocationRepository();
    vi.spyOn(allocations, "save").mockRejectedValue(new Error("db down"));
    const useCase = build(wallet, allocations);

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k1" })).rejects.toThrow("db down");

    expect(credit).toHaveBeenCalledTimes(1);
    expect(credit.mock.calls[0][2]).toMatchObject({ category: "refund", idempotencyKey: "bundle-refund:t1:k1" });
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(1000);
  });

  it("refunds when the transaction row fails after the allocation saved", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });
    const allocations = new InMemoryBundleAllocationRepository();
    const transactions = { save: vi.fn().mockRejectedValue(new Error("tx down")) };
    const useCase = build(wallet, allocations, transactions);

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k2" })).rejects.toThrow("tx down");

    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(1000);
    const saved = await allocations.findByPaymentReference("t1", "k2");
    expect(saved.every((a) => a.status === "cancelled")).toBe(true);
  });

  it("replayed purchase returns the original allocation and debits once", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: new Date() });
    const debit = vi.spyOn(wallet, "debit");
    const spend = vi.fn();
    const allocations = new InMemoryBundleAllocationRepository();
    const useCase = build(wallet, allocations, undefined, { assertWithinLimit: async () => {}, recordSpend: spend });

    const first = await useCase.execute("tok", { ...payload, idempotencyKey: "k3" });
    const second = await useCase.execute("tok", { ...payload, idempotencyKey: "k3" });

    expect(second.data.allocationIds).toEqual(first.data.allocationIds);
    expect(debit.mock.calls.length).toBeLessThanOrEqual(1);
    expect(spend).toHaveBeenCalledTimes(1);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(4000);
    expect((await allocations.findByPaymentReference("t1", "k3")).length).toBe(1);
  });

  it("replayed debit with a lost lookup still returns the existing allocation without new rows", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: new Date() });
    const allocations = new InMemoryBundleAllocationRepository();
    const useCase = build(wallet, allocations);
    const first = await useCase.execute("tok", { ...payload, idempotencyKey: "k4" });

    const find = vi.spyOn(allocations, "findByPaymentReference");
    find.mockResolvedValueOnce([]);
    const second = await useCase.execute("tok", { ...payload, idempotencyKey: "k4" });

    expect(second.data.allocationIds).toEqual(first.data.allocationIds);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(4000);
    expect((await allocations.findByPaymentReference("t1", "k4")).length).toBe(1);
  });

  it("works without a key and stores a generated one as payment reference", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: new Date() });
    const transactions = { save: vi.fn().mockResolvedValue(undefined) };
    const useCase = build(wallet, new InMemoryBundleAllocationRepository(), transactions);

    const a = await useCase.execute("tok", payload);
    const b = await useCase.execute("tok", payload);

    expect(a.data.allocationIds[0]).not.toBe(b.data.allocationIds[0]);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(3000);
    const ref = transactions.save.mock.calls[0][0].paymentReference;
    expect(typeof ref).toBe("string");
    expect(ref.length).toBeGreaterThan(0);
  });

  it("retry after a failed-and-refunded purchase is rejected, not reported as success", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });
    const allocations = new InMemoryBundleAllocationRepository();
    const transactions = { save: vi.fn().mockRejectedValue(new Error("tx down")) };
    const useCase = build(wallet, allocations, transactions);
    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k5" })).rejects.toThrow("tx down");

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k5" })).rejects.toBeInstanceOf(PurchaseRefundedError);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(1000);
  });

  it("keeps the original error and heals the refund on retry when credit fails", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });
    const allocations = new InMemoryBundleAllocationRepository();
    vi.spyOn(allocations, "save").mockRejectedValue(new Error("db down"));
    const credit = vi.spyOn(wallet, "credit").mockRejectedValueOnce(new Error("wallet down"));
    const useCase = build(wallet, allocations);

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k6" })).rejects.toThrow("db down");
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(0);

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k6" })).rejects.toThrow("use a new idempotency key");
    expect(credit).toHaveBeenCalledTimes(2);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(1000);
  });

  it("retry with partially saved active allocations cancels them and refunds", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 2000, currency: "NGN", updatedAt: new Date() });
    const allocations = new InMemoryBundleAllocationRepository();
    const useCase = build(wallet, allocations);
    const two = { ...payload, mobileNumbers: ["1", "2"], idempotencyKey: "k7" };
    const realSave = allocations.save.bind(allocations);
    let n = 0;
    vi.spyOn(allocations, "save").mockImplementation(async (a) => {
      if (a.status === "active" && ++n === 2) throw new Error("db down");
      return realSave(a);
    });
    const credit = vi.spyOn(wallet, "credit").mockRejectedValueOnce(new Error("wallet down"));
    await expect(useCase.execute("tok", two)).rejects.toThrow("db down");

    await expect(useCase.execute("tok", two)).rejects.toThrow("use a new idempotency key");
    expect(credit).toHaveBeenCalledTimes(2);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(2000);
    const saved = await allocations.findByPaymentReference("t1", "k7");
    expect(saved.every((a) => a.status === "cancelled")).toBe(true);
  });
});

function sim(overrides: Partial<StoredSim>): StoredSim {
  return {
    id: "s1", iccid: "8923400000000000001", imsi: null, msisdn: "08000000001", carrier: "MTN", plan: "iot_basic",
    status: "active", tenantId: "t1", deviceId: null, deviceName: null, deviceImei: null, deviceType: null,
    vehicleId: null, suspensionReason: null, notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0, smsLimit: 0,
    monthlyCostNgn: 0, activationDate: null, expiryDate: null, lastActivity: null, signalStrength: null,
    networkType: null, roaming: false, fonuSimId: null, fonuStatus: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

describe("AllocateBundleUseCase — unknown references", () => {
  async function setup() {
    const now = new Date();
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: now });
    const carriers = new InMemoryBundleCarrierRepository();
    await carriers.save({ id: "carrier-mtn", name: "MTN", displayName: "MTN", active: true, createdAt: now, updatedAt: now });
    await carriers.save({ id: "carrier-glo", name: "Glo", displayName: "Glo", active: true, createdAt: now, updatedAt: now });
    const catalog = new InMemoryBundleCatalogRepository();
    await catalog.save({
      id: "bundle-mtn-1gb", code: "MTN-1GB", name: "MTN 1GB", carrierId: "carrier-mtn", dataAmountGb: 1, validityDays: 30,
      billingCycle: "monthly", priceKobo: 1000, currency: "NGN", active: true, createdAt: now, updatedAt: now,
    });
    const sims = new InMemorySimRepository();
    await sims.save(sim({ id: "s1", msisdn: "08000000001" }));
    await sims.save(sim({ id: "s2", iccid: "8923400000000000002", msisdn: "08000000002", tenantId: "other" }));
    const allocations = new InMemoryBundleAllocationRepository();
    const transactions = { save: vi.fn().mockResolvedValue(undefined) };
    const limit = { assertWithinLimit: vi.fn(), recordSpend: vi.fn() };
    const debit = vi.spyOn(wallet, "debit");
    const useCase = new AllocateBundleUseCase(
      {} as any, {} as any, catalog, wallet, allocations, transactions as any, limit as any, carriers, sims,
    );
    return { useCase, wallet, allocations, transactions, debit, limit };
  }

  const valid = { carrierId: "carrier-mtn", planType: "monthly", bundleId: "bundle-mtn-1gb", mobileNumbers: ["08000000001"] };

  it.each([
    ["carrierId", { carrierId: "00000000-0000-4000-8000-000000000000" }, "Carrier not found"],
    ["bundleId", { bundleId: "00000000-0000-4000-8000-000000000000" }, "Bundle not found"],
    ["bundleId", { carrierId: "carrier-glo" }, "Bundle does not belong to this carrier"],
    ["mobileNumbers", { mobileNumbers: ["08000000000"] }, "No SIM found for: 08000000000"],
    ["mobileNumbers", { mobileNumbers: ["08000000001", "08000000002"] }, "No SIM found for: 08000000002"],
  ])("refuses an unknown %s before charging or writing anything", async (field, override, message) => {
    const { useCase, wallet, allocations, transactions, debit, limit } = await setup();

    const result = useCase.execute("tok", { ...valid, ...override, idempotencyKey: "k-ref" });

    await expect(result).rejects.toBeInstanceOf(AllocationReferenceError);
    await expect(result).rejects.toMatchObject({ field, message });
    expect(debit).not.toHaveBeenCalled();
    expect(limit.assertWithinLimit).not.toHaveBeenCalled();
    expect(transactions.save).not.toHaveBeenCalled();
    expect(await allocations.findByPaymentReference("t1", "k-ref")).toHaveLength(0);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(5000);
  });

  it("allocates when every reference resolves", async () => {
    const { useCase, wallet } = await setup();

    const result = await useCase.execute("tok", { ...valid, idempotencyKey: "k-ok" });

    expect(result.data.successfulCount).toBe(1);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(4000);
  });
});

describe("AllocateBundleUseCase — what a purchase may name", () => {
  it("charges a SIM once however many times the request names it", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: new Date() });

    const result = await build(wallet, new InMemoryBundleAllocationRepository()).execute("tok", {
      ...payload,
      mobileNumbers: ["234000", "234000", " 234000 "],
    });

    expect(result.data.successfulCount).toBe(1);
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(4000);
  });

  it("refuses an inactive bundle before charging", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 5000, currency: "NGN", updatedAt: new Date() });
    const catalog = { findById: vi.fn().mockResolvedValue({ id: "b1", carrierId: "c1", name: "B", priceKobo: 1000, dataAmountGb: 1, validityDays: 30, active: false }) };
    const useCase = new AllocateBundleUseCase({} as any, {} as any, catalog as any, wallet, new InMemoryBundleAllocationRepository() as any, { save: vi.fn() } as any, noSpendingLimit(), carrierC1(), anySims());

    await expect(useCase.execute("tok", payload)).rejects.toMatchObject({ field: "bundleId", message: "Bundle is not available" });
    expect((await wallet.findByTenantId("t1"))?.balanceKobo).toBe(5000);
  });

  it("reports a short wallet as the shared insufficient-balance error", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 10, currency: "NGN", updatedAt: new Date() });

    await expect(build(wallet, new InMemoryBundleAllocationRepository()).execute("tok", payload)).rejects.toBeInstanceOf(
      InsufficientWalletBalanceError,
    );
  });
});
