import { describe, expect, it } from "vitest";
import { analyticsWindow } from "../../../apps/auth/src/analytics-range";
import { BundleExpirySweepService } from "../../../apps/auth/src/bundle-expiry-sweep.service";
import { InMemoryBundleAllocationRepository } from "../../../apps/auth/src/in-memory-bundle-allocation.repository";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

async function allocations() {
  const repo = new InMemoryBundleAllocationRepository();
  const base = { tenantId: "t1", mobileNumber: "234", bundleId: "b1", dataUsedMb: 0, dataTotalMb: 1024, activatedAt: day(-30), paymentReference: "k", createdAt: day(-30), updatedAt: day(-30) };
  await repo.save({ ...base, id: "live", status: "active", expiresAt: day(20) });
  await repo.save({ ...base, id: "soon", status: "active", expiresAt: day(3) });
  await repo.save({ ...base, id: "past", status: "active", expiresAt: day(-1) });
  await repo.save({ ...base, id: "refunded", status: "cancelled", expiresAt: day(20) });
  return repo;
}

describe("bundle expiry", () => {
  it("treats an active allocation past expiry as expired before the sweep runs", async () => {
    const repo = await allocations();

    expect((await repo.findAll({ tenantId: "t1", status: "expired" })).items.map((a) => a.id)).toEqual(["past"]);
    expect((await repo.findAll({ tenantId: "t1", status: "expiring" })).items.map((a) => a.id)).toEqual(["soon"]);
    expect(await repo.countByStatus("t1")).toEqual({ active: 2, expired: 1, cancelled: 1 });
  });

  it("leaves cancelled allocations out of the list", async () => {
    const { items, total } = await (await allocations()).findAll({ tenantId: "t1" });

    expect(total).toBe(3);
    expect(items.map((a) => a.id)).not.toContain("refunded");
  });

  it("the sweep moves only past-due active allocations to expired", async () => {
    const repo = await allocations();
    const sweep = new BundleExpirySweepService({ persistence: { backend: "in-memory" } } as never, repo);

    expect(await sweep.run()).toBe(1);
    expect((await repo.findById("past"))?.status).toBe("expired");
    expect((await repo.findById("soon"))?.status).toBe("active");
    expect(await sweep.run()).toBe(0);
  });
});

describe("custom analytics window", () => {
  it("covers the whole Lagos day when start and end are the same date", () => {
    const { start, end } = analyticsWindow("custom", "2026-11-22", "2026-11-22");

    expect(start.toISOString()).toBe("2026-11-21T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-22T22:59:59.999Z");
  });
});
