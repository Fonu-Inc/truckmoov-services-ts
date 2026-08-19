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

function makeUseCase(wallet: InMemoryTenantWalletRepository) {
  const bundleCatalogRepository = {
    findById: vi.fn().mockResolvedValue({
      id: "b1",
      priceKobo: 1000,
      dataAmountGb: 1,
      validityDays: 30,
    }),
  };
  const bundleAllocationRepository = { save: vi.fn().mockResolvedValue(undefined) };
  const bundleTransactionRepository = { save: vi.fn().mockResolvedValue(undefined) };

  return new AllocateBundleUseCase(
    {} as any,
    {} as any,
    bundleCatalogRepository as any,
    wallet,
    bundleAllocationRepository as any,
    bundleTransactionRepository as any,
  );
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

  it("refunds the reserved cost when an allocation write fails", async () => {
    const wallet = new InMemoryTenantWalletRepository();
    await wallet.save({ tenantId: "t1", balanceKobo: 1000, currency: "NGN", updatedAt: new Date() });

    const bundleCatalogRepository = {
      findById: vi.fn().mockResolvedValue({ id: "b1", priceKobo: 1000, dataAmountGb: 1, validityDays: 30 }),
    };
    const bundleAllocationRepository = { save: vi.fn().mockRejectedValue(new Error("db down")) };
    const bundleTransactionRepository = { save: vi.fn().mockResolvedValue(undefined) };

    const useCase = new AllocateBundleUseCase(
      {} as any,
      {} as any,
      bundleCatalogRepository as any,
      wallet,
      bundleAllocationRepository as any,
      bundleTransactionRepository as any,
    );

    const res = await useCase.execute("tok", {
      carrierId: "c1",
      planType: "p",
      bundleId: "b1",
      mobileNumbers: ["234000"],
    });

    expect(res.data.successfulCount).toBe(0);
    const after = await wallet.findByTenantId("t1");
    expect(after?.balanceKobo).toBe(1000);
  });
});
