import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({ resolveActorUser: vi.fn().mockResolvedValue({ tenantId: "t1" }) }),
);

import { RegisterSimsUseCase } from "../../../apps/auth/src/register-sims.use-case";
import { ExportBundleRatesUseCase } from "../../../apps/auth/src/export-bundle-rates.use-case";
import { ExportBundleTransactionsUseCase } from "../../../apps/auth/src/export-bundle-transactions.use-case";
import { InMemoryBundleCatalogRepository } from "../../../apps/auth/src/in-memory-bundle-catalog.repository";
import { InMemoryBundleTransactionRepository } from "../../../apps/auth/src/in-memory-bundle-transaction.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { DuplicateSimIccidError, type StoredSim } from "../../../apps/auth/src/sim.repository";

const sim = (id: string, iccid: string) => ({ id, iccid, tenantId: "t1" }) as StoredSim;

describe("in-memory SIM repository", () => {
  it("rejects an ICCID already held under another id", async () => {
    const repo = new InMemorySimRepository();
    await repo.save(sim("a", "111"));

    await expect(repo.save(sim("b", "111"))).rejects.toBeInstanceOf(DuplicateSimIccidError);
    await expect(repo.save(sim("a", "111"))).resolves.toBeUndefined();
  });
});

describe("registering SIMs", () => {
  function build(repo = new InMemorySimRepository()) {
    const assertTenantQuota = vi.fn(async () => undefined);
    const uc = new RegisterSimsUseCase(
      {} as never, {} as never, repo,
      { assertTenantQuota } as never,
      { findByTenantId: async () => null } as never,
    );
    return { uc, repo, assertTenantQuota };
  }
  const row = (iccid: string) => ({ iccid, mobileNumber: "0800", networkOperator: "MTN" });

  it("saves the good rows and lists the duplicates instead of failing the batch", async () => {
    const { uc, repo } = build();
    await repo.save(sim("old", "222"));

    const result = await uc.execute("tok", [row("111"), row("222"), row("111"), row("333")]);

    expect(result.data.registered).toBe(2);
    expect(result.data.created.map((c) => c.iccid)).toEqual(["111", "333"]);
    expect(result.data.skipped.map((s) => s.iccid)).toEqual(["222", "111"]);
  });

  it("counts only the SIMs that would be created against the plan quota", async () => {
    const { uc, repo, assertTenantQuota } = build();
    await repo.save(sim("old", "222"));

    await uc.execute("tok", [row("111"), row("222"), row("111")]);

    expect(assertTenantQuota).toHaveBeenCalledWith("t1", null, "sims", 1);
  });

  it("does not consult the quota when every row is already registered", async () => {
    const { uc, repo, assertTenantQuota } = build();
    await repo.save(sim("old", "222"));

    await uc.execute("tok", [row("222")]);

    expect(assertTenantQuota).not.toHaveBeenCalled();
  });

  it("re-throws anything other than a duplicate", async () => {
    const { uc, repo } = build();
    vi.spyOn(repo, "save").mockRejectedValue(new Error("db down"));

    await expect(uc.execute("tok", [row("1")])).rejects.toThrow("db down");
  });
});

describe("bundle exports", () => {
  const bundle = (id: string, carrierId: string) => ({
    id, code: id, name: id, carrierId, dataAmountGb: 1, validityDays: 30, billingCycle: "monthly",
    priceKobo: 100, currency: "NGN", active: true, createdAt: new Date(), updatedAt: new Date(),
  });

  it("exports only the rates of the chosen carriers", async () => {
    const catalog = new InMemoryBundleCatalogRepository();
    await catalog.save(bundle("b1", "mtn"));
    await catalog.save(bundle("b2", "glo"));
    const findAll = vi.spyOn(catalog, "findAll");

    await new ExportBundleRatesUseCase({} as never, {} as never, catalog).execute("tok", { carriers: ["mtn"] });

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ carrierIds: ["mtn"] }));
  });

  it("exports only the transactions of the chosen carriers", async () => {
    const catalog = new InMemoryBundleCatalogRepository();
    await catalog.save(bundle("b1", "mtn"));
    await catalog.save(bundle("b2", "glo"));
    const transactions = new InMemoryBundleTransactionRepository();
    const findAll = vi.spyOn(transactions, "findAll");

    await new ExportBundleTransactionsUseCase({} as never, {} as never, transactions, catalog).execute("tok", {
      carriers: ["mtn"],
    });

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", bundleIds: ["b1"] }));
  });
});
