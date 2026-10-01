import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DriversController } from "../../../apps/fleet/src/drivers.controller";
import { DriverBehaviorUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/driver-behavior.use-case";
import type { StoredBehaviorEvent } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-behavior";
import { InMemoryBehaviorEventRepository } from "../../../apps/fleet/src/in-memory-driver-behavior.repository";

function event(overrides: Partial<StoredBehaviorEvent> = {}): StoredBehaviorEvent {
  const now = new Date();
  return {
    id: "e1",
    tenantId: "t1",
    driverId: "mine",
    vehicleId: "v1",
    type: "harsh_braking",
    severity: "critical",
    speedKph: 70,
    latitude: null,
    longitude: null,
    occurredAt: now,
    createdAt: now,
    ...overrides,
  };
}

async function setup(owned: Set<string> | null, events: StoredBehaviorEvent[] = []) {
  const repository = new InMemoryBehaviorEventRepository();
  for (const stored of events) await repository.save(stored);
  const recordActivity = vi.fn(async () => undefined);
  const instance = Object.assign(Object.create(DriversController.prototype), {
    driverBehaviorUseCase: new DriverBehaviorUseCase(repository, {} as never, {} as never, {} as never),
    ownedDriverIds: vi.fn(async () => owned),
    tenantIdFromRequest: () => "t1",
    recordActivity,
  }) as DriversController;
  const remaining = async (tenantId = "t1") => (await repository.findAll(tenantId)).map((stored) => stored.id);
  return { instance, recordActivity, remaining };
}

describe("DELETE /fleet/drivers/behavior/events/:eventId", () => {
  it("removes the event and audits it against the driver", async () => {
    const { instance, recordActivity, remaining } = await setup(null, [event()]);

    await expect(instance.deleteBehaviorEvent("e1", {} as never)).resolves.toEqual({
      status: true,
      message: "Event deleted",
      data: { id: "e1", driverId: "mine" },
    });
    expect(await remaining()).toEqual([]);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "driver",
        entityId: "mine",
        action: "driver.behavior_event.deleted",
        metadata: expect.objectContaining({ eventId: "e1", type: "harsh_braking", severity: "critical" }),
      }),
    );
  });

  it("answers 404 for an unknown id", async () => {
    const { instance, recordActivity } = await setup(null, [event()]);

    await expect(instance.deleteBehaviorEvent("missing", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("answers 404 for another tenant's event and leaves it in place", async () => {
    const { instance, recordActivity, remaining } = await setup(null, [event({ tenantId: "t2" })]);

    await expect(instance.deleteBehaviorEvent("e1", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(await remaining("t2")).toEqual(["e1"]);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("lets an owner operator delete only events on their own drivers", async () => {
    const { instance, remaining } = await setup(new Set(["mine"]), [
      event({ id: "own" }),
      event({ id: "other", driverId: "theirs" }),
    ]);

    await expect(instance.deleteBehaviorEvent("other", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(instance.deleteBehaviorEvent("own", {} as never)).resolves.toMatchObject({ data: { id: "own" } });
    expect(await remaining()).toEqual(["other"]);
  });
});
