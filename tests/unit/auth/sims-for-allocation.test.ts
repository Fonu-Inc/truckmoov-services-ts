import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../apps/auth/src/contexts/auth/session/application/use-cases/support/resolve-actor-user",
  () => ({ resolveActorUser: vi.fn().mockResolvedValue({ tenantId: "t1" }) }),
);

import { ListSimsForAllocationUseCase } from "../../../apps/auth/src/list-sims-for-allocation.use-case";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";

function sim(id: string, carrier: string): StoredSim {
  return {
    id, iccid: `icc-${id}`, imsi: null, msisdn: `234${id}`, carrier, plan: "p", status: "active", tenantId: "t1",
    deviceId: null, deviceName: null, deviceImei: null, deviceType: null, vehicleId: null, suspensionReason: null,
    notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0, smsLimit: 0, monthlyCostNgn: 0, activationDate: null,
    expiryDate: null, createdAt: new Date(), updatedAt: new Date(),
  } as StoredSim;
}

async function useCase() {
  const sims = new InMemorySimRepository();
  await sims.save(sim("1", "MTN"));
  await sims.save(sim("2", "Airtel"));
  const carriers = { findById: async (id: string) => (id === "carrier-mtn" ? { id, name: "mtn", active: true } : null) };
  return new ListSimsForAllocationUseCase({} as never, {} as never, sims, carriers as never);
}

describe("SIMs offered for a bundle", () => {
  // A SIM stores its network by name, the catalog by id: comparing the two
  // directly matched nothing.
  it("filters by the carrier the catalog id names", async () => {
    const result = await (await useCase()).execute("tok", { carrierId: "carrier-mtn" });

    expect(result.data.items.map((s) => s.id)).toEqual(["1"]);
  });

  it("lists nothing for a carrier the catalog doesn't know", async () => {
    const result = await (await useCase()).execute("tok", { carrierId: "carrier-nope" });

    expect(result.data.items).toEqual([]);
  });

  it("lists every SIM without a carrier filter", async () => {
    const result = await (await useCase()).execute("tok", {});

    expect(result.data.items).toHaveLength(2);
  });
});
