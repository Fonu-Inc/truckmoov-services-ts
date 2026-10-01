import { describe, expect, it, vi } from "vitest";
import { InternalBundleCatalogController } from "../../../apps/auth/src/internal-bundle-catalog.controller";
import { InMemoryBundleCarrierRepository } from "../../../apps/auth/src/in-memory-bundle-carrier.repository";
import { InMemoryBundleCatalogRepository } from "../../../apps/auth/src/in-memory-bundle-catalog.repository";
import type { BundleCatalogFilters } from "../../../apps/auth/src/bundle-catalog.repository";

const now = new Date();

// Pages at 50 when no limit is given, as the Postgres repository does.
class PagedBundleCatalog extends InMemoryBundleCatalogRepository {
  override findAll(filters?: BundleCatalogFilters) {
    return super.findAll({ limit: 50, ...filters });
  }
}

async function harness(serviceFor = vi.fn().mockResolvedValue("fleet")) {
  const carriers = new InMemoryBundleCarrierRepository();
  const bundles = new PagedBundleCatalog();
  await carriers.save({ id: "car-mtn", name: "MTN", displayName: "MTN Nigeria", active: true, createdAt: now, updatedAt: now });
  await carriers.save({ id: "car-old", name: "Old", displayName: "Old", active: false, createdAt: now, updatedAt: now });
  const bundle = {
    carrierId: "car-mtn", dataAmountGb: 1, validityDays: 30, billingCycle: "monthly",
    priceKobo: 100000, currency: "NGN", createdAt: now, updatedAt: now,
  };
  for (let i = 0; i < 55; i += 1) {
    await bundles.save({ ...bundle, id: `b-${i}`, code: `B-${i}`, name: `Bundle ${i}`, active: true });
  }
  await bundles.save({ ...bundle, id: "b-retired", code: "B-RETIRED", name: "Retired", active: false });
  const controller = new InternalBundleCatalogController({ serviceFor } as never, carriers, bundles);
  return { controller, serviceFor };
}

describe("internal bundle catalogue", () => {
  it("answers fleet only", async () => {
    const { controller, serviceFor } = await harness(vi.fn().mockResolvedValue(null));
    await expect(controller.catalog({})).rejects.toThrow("Invalid service token");
    expect(serviceFor).toHaveBeenCalledWith({}, ["fleet"]);
  });

  it("serves every active carrier and bundle, past the repository's default page", async () => {
    const { controller } = await harness();
    const { data } = await controller.catalog({});

    expect(data.carriers).toEqual([{ id: "car-mtn", name: "MTN", displayName: "MTN Nigeria", active: true }]);
    expect(data.bundles).toHaveLength(55);
    expect(data.bundles.some((b) => b.id === "b-retired")).toBe(false);
    expect(data.bundles[0]).toMatchObject({ carrierId: "car-mtn", priceKobo: 100000, dataAmountGb: 1, billingCycle: "monthly" });
  });
});
