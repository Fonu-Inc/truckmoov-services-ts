import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({ resolveActorUser: vi.fn().mockResolvedValue({ tenantId: "t1" }) }),
);

import { ListTenantSimRequestsUseCase } from "../../../apps/auth/src/list-tenant-sim-requests.use-case";
import { SubmitTenantSimRequestUseCase } from "../../../apps/auth/src/submit-tenant-sim-request.use-case";
import { ImportTenantSimsCsvUseCase } from "../../../apps/auth/src/import-tenant-sims-csv.use-case";
import { ListBundleRatesUseCase } from "../../../apps/auth/src/list-bundle-rates.use-case";
import { ListBundleTransactionsUseCase } from "../../../apps/auth/src/list-bundle-transactions.use-case";
import { InMemorySimProvisioningRequestRepository } from "../../../apps/auth/src/in-memory-sim-provisioning-request.repository";
import { InMemoryBundleCatalogRepository } from "../../../apps/auth/src/in-memory-bundle-catalog.repository";
import { InMemoryBundleTransactionRepository } from "../../../apps/auth/src/in-memory-bundle-transaction.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { DuplicateSimIccidError, type SimRepository } from "../../../apps/auth/src/sim.repository";
import { SimNotFoundError } from "../../../apps/auth/src/list-tenant-sims.use-case";
import type { StoredSimProvisioningRequest } from "../../../apps/auth/src/sim-provisioning-request.repository";

function request(id: string, tenantId: string, createdAt: Date): StoredSimProvisioningRequest {
  return {
    id, tenantId, tenantName: tenantId, requestType: "activation", numberOfSims: 1, preferredOperator: "MTN",
    requestedPlan: "iot_basic", requestedDataLimitMb: 1024, deploymentTimeline: null, useCase: null,
    deviceMappingData: null, status: "pending", approvedBy: null, approvedByName: null, approvedAt: null,
    rejectedReason: null, fonuRequestId: null, fonuResponse: null, createdAt, updatedAt: createdAt,
  };
}

describe("tenant SIM request list", () => {
  it("returns only the actor's requests, paged, with the real total", async () => {
    const repo = new InMemorySimProvisioningRequestRepository();
    await repo.save(request("a1", "t1", new Date("2026-01-01")));
    await repo.save(request("a2", "t1", new Date("2026-01-02")));
    await repo.save(request("a3", "t1", new Date("2026-01-03")));
    await repo.save(request("b1", "t2", new Date("2026-01-04")));
    const uc = new ListTenantSimRequestsUseCase({} as never, {} as never, repo);

    const page = await uc.execute("tok", { page: 2, limit: 2 });

    expect(page.data.total).toBe(3);
    expect(page.data.items.map((r) => r.id)).toEqual(["a1"]);
  });

  it("caps the page size", async () => {
    const repo = new InMemorySimProvisioningRequestRepository();
    const findAll = vi.spyOn(repo, "findAll");
    const uc = new ListTenantSimRequestsUseCase({} as never, {} as never, repo);

    await uc.execute("tok", { limit: 100000 });

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", limit: 100 }));
  });
});

describe("submitting a SIM request", () => {
  function build(mappingFiles: Record<string, { tenantId: string }>) {
    const requests = new InMemorySimProvisioningRequestRepository();
    const files = { findById: async (id: string) => mappingFiles[id] ?? null };
    const bundles = new InMemoryBundleCatalogRepository();
    const uc = new SubmitTenantSimRequestUseCase(
      {} as never, {} as never, requests,
      { findByTenantId: async () => null } as never, files as never, bundles,
    );
    return { uc, requests };
  }
  const payload = { quantity: 1, carrier: "MTN", planType: "iot_basic", dataBundlePlanId: "b1" };

  it("accepts a mapping file the tenant owns", async () => {
    const { uc, requests } = build({ f1: { tenantId: "t1" } });

    await uc.execute("tok", { ...payload, deviceMappingFileId: "f1" });

    expect(await requests.count({ tenantId: "t1" })).toBe(1);
  });

  it("refuses another tenant's mapping file as not found", async () => {
    const { uc, requests } = build({ f1: { tenantId: "t2" } });

    await expect(uc.execute("tok", { ...payload, deviceMappingFileId: "f1" })).rejects.toBeInstanceOf(SimNotFoundError);
    await expect(uc.execute("tok", { ...payload, deviceMappingFileId: "missing" })).rejects.toBeInstanceOf(SimNotFoundError);
    expect(await requests.count({ tenantId: "t1" })).toBe(0);
  });
});

describe("tenant SIM CSV import", () => {
  it("skips a row whose ICCID already exists instead of failing the file", async () => {
    const sims = {
      save: vi.fn(async (sim: { iccid: string }) => {
        if (sim.iccid === "dup") throw new DuplicateSimIccidError("dup");
      }),
    } as unknown as SimRepository;
    const uc = new ImportTenantSimsCsvUseCase({} as never, {} as never, sims);

    const result = await uc.execute("tok", Buffer.from("iccid,operator\nnew,MTN\ndup,MTN\n,MTN\n"));

    expect(result.data).toMatchObject({ importedCount: 1, skippedCount: 1, failedCount: 1 });
    expect(result.data.skipped).toEqual([{ row: 3, field: "iccid", message: "Skipped: cannot be added" }]);
  });

  it("re-throws anything other than a duplicate", async () => {
    const sims = { save: vi.fn().mockRejectedValue(new Error("db down")) } as unknown as SimRepository;
    const uc = new ImportTenantSimsCsvUseCase({} as never, {} as never, sims);

    await expect(uc.execute("tok", Buffer.from("iccid\nx\n"))).rejects.toThrow("db down");
  });

  it("keeps the in-memory repository usable for new ICCIDs", async () => {
    const uc = new ImportTenantSimsCsvUseCase({} as never, {} as never, new InMemorySimRepository());

    const result = await uc.execute("tok", Buffer.from("iccid\na\nb\n"));

    expect(result.data.importedCount).toBe(2);
  });
});

function bundle(id: string, carrierId: string) {
  return {
    id, code: id, name: id, carrierId, dataAmountGb: 1, validityDays: 30, billingCycle: "monthly",
    priceKobo: 100, currency: "NGN", active: true, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe("bundle rates carrier filter", () => {
  it("filters before paging so the total and page are right", async () => {
    const catalog = new InMemoryBundleCatalogRepository();
    for (const b of [bundle("a", "mtn"), bundle("b", "airtel"), bundle("c", "mtn"), bundle("d", "mtn")]) {
      await catalog.save(b);
    }
    const uc = new ListBundleRatesUseCase({} as never, {} as never, catalog);

    const result = await uc.execute("tok", { carriers: ["mtn"], page: 2, limit: 2 });

    expect(result.data.total).toBe(3);
    expect(result.data.items).toHaveLength(1);
  });
});

describe("bundle transactions carrier filter", () => {
  it("returns only transactions for bundles of the chosen carriers", async () => {
    const catalog = new InMemoryBundleCatalogRepository();
    await catalog.save(bundle("b-mtn", "mtn"));
    await catalog.save(bundle("b-airtel", "airtel"));
    const transactions = new InMemoryBundleTransactionRepository();
    for (const [id, bundleId] of [["1", "b-mtn"], ["2", "b-airtel"]] as const) {
      await transactions.save({
        id, tenantId: "t1", mobileNumber: "234", bundleId, amountKobo: 1, status: "success",
        paymentReference: null, failureReason: null, createdAt: new Date(),
      });
    }
    const uc = new ListBundleTransactionsUseCase({} as never, {} as never, transactions, catalog);

    const result = await uc.execute("tok", { carriers: ["mtn"] });

    expect(result.data.items.map((t) => t.id)).toEqual(["1"]);
    expect(result.data.total).toBe(1);
  });

  it("returns nothing when the carrier has no bundles", async () => {
    const uc = new ListBundleTransactionsUseCase(
      {} as never, {} as never, new InMemoryBundleTransactionRepository(), new InMemoryBundleCatalogRepository(),
    );

    const result = await uc.execute("tok", { carriers: ["ghost"] });

    expect(result.data.items).toEqual([]);
  });
});
