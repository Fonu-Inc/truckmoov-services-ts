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

// No limit configured: allow every spend and record nothing.
function noSpendingLimit() {
  return { assertWithinLimit: async () => {}, recordSpend: async () => {} } as any;
}

function makeUseCase(wallet: InMemoryTenantWalletRepository) {
  const bundleCatalogRepository = {
    findById: vi.fn().mockResolvedValue({
      id: "b1",
      priceKobo: 1000,
      dataAmountGb: 1,
      validityDays: 30,
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
    findById: vi.fn().mockResolvedValue({ id: "b1", name: "B", priceKobo: 1000, dataAmountGb: 1, validityDays: 30 }),
  };
  return new AllocateBundleUseCase({} as any, {} as any, catalog as any, wallet, allocations as any, transactions as any, limit);
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
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: "Insufficient wallet balance",
    });

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

    await expect(useCase.execute("tok", { ...payload, idempotencyKey: "k5" })).rejects.toThrow("use a new idempotency key");
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
