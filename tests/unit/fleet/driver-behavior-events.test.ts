import { describe, expect, it } from "vitest";
import { DriverBehaviorUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-behavior.use-case";
import type { StoredBehaviorEvent } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-behavior";
import { InMemoryBehaviorEventRepository } from "../../../apps/fleet/src/in-memory-driver-behavior.repository";

function event(overrides: Partial<StoredBehaviorEvent> = {}): StoredBehaviorEvent {
  const now = new Date();
  return {
    id: "e1",
    tenantId: "t1",
    driverId: "d1",
    vehicleId: "v1",
    type: "overspeeding",
    severity: "high",
    speedKph: 118,
    // Lagos.
    latitude: 6.5244,
    longitude: 3.3792,
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe("Driver behavior event list", () => {
  it("adds the nearest region and leaves an out-of-range fix without one", async () => {
    const repository = new InMemoryBehaviorEventRepository();
    await repository.save(event());
    await repository.save(event({ id: "e2", latitude: null, longitude: null }));
    const useCase = new DriverBehaviorUseCase(repository, {} as never, {} as never, {} as never);

    const result = await useCase.listEvents("t1", { periodDays: 30 });
    const byId = new Map(result.items.map((item) => [item.id, item]));

    expect(byId.get("e1")?.location).toBe("Lagos");
    expect(byId.get("e2")?.location).toBeNull();
  });
});
