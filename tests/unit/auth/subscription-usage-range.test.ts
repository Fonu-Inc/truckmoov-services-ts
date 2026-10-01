import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({ resolveActorUser: vi.fn().mockResolvedValue({ tenantId: "t1" }) }),
);

import { GetSubscriptionUsageUseCase } from "../../../apps/auth/src/get-subscription-usage.use-case";
import { InMemoryBundleAllocationRepository } from "../../../apps/auth/src/in-memory-bundle-allocation.repository";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

async function useCase() {
  const allocations = new InMemoryBundleAllocationRepository();
  const base = { tenantId: "t1", mobileNumber: "234", status: "active", paymentReference: "k", createdAt: day(0), updatedAt: day(0) };
  await allocations.save({ ...base, id: "recent", bundleId: "b-recent", dataUsedMb: 300, dataTotalMb: 1024, activatedAt: day(-5), expiresAt: day(25) } as never);
  await allocations.save({ ...base, id: "old", bundleId: "b-old", dataUsedMb: 900, dataTotalMb: 1024, activatedAt: day(-80), expiresAt: day(-50) } as never);
  return new GetSubscriptionUsageUseCase({} as never, {} as never, allocations);
}

describe("subscription usage over a range", () => {
  it("counts only allocations live in the range", async () => {
    const result = await (await useCase()).execute("tok", "30d");

    expect(result.data.usage.map((u) => u.bundleId)).toEqual(["b-recent"]);
  });

  it("widens with the range", async () => {
    const result = await (await useCase()).execute("tok", "90d");

    expect(result.data.usage.map((u) => u.bundleId).sort()).toEqual(["b-old", "b-recent"]);
  });

  it("honours a custom window", async () => {
    const start = day(-70).toISOString();
    const end = day(-60).toISOString();
    const result = await (await useCase()).execute("tok", "custom", start, end);

    expect(result.data.usage.map((u) => u.bundleId)).toEqual(["b-old"]);
  });
});
