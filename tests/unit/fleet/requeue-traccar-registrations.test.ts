import { describe, expect, it } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { RequeueTraccarRegistrationsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/requeue-traccar-registrations.use-case";

const NOW = new Date("2026-11-27T10:00:00.000Z");

function device(id: string, overrides: Record<string, unknown> = {}) {
  return Device.create({
    id,
    imei: `35977909001${id.padStart(4, "0")}`,
    manufacturer: "Teltonika",
    model: "FMC130",
    firmwareVersion: "3.28.07",
    tenantId: "t1",
    lifecycleStatus: "assignable",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    traccarDeviceId: null,
    provisionStatus: "failed",
    provisionAttempts: 8,
    provisionNextAttemptAt: null,
    provisionError: "ECONNREFUSED",
    ...overrides,
  } as never);
}

async function setup() {
  const repo = new InMemoryDeviceRepository();
  await repo.save(device("1"));
  await repo.save(device("2"));
  await repo.save(device("3", { provisionStatus: "registered", provisionAttempts: 0, provisionError: null }));
  await repo.save(device("4", { lifecycleStatus: "decommissioned" }));
  return { repo, useCase: new RequeueTraccarRegistrationsUseCase(repo) };
}

describe("RequeueTraccarRegistrationsUseCase", () => {
  it("re-queues every failed device when no ids are given", async () => {
    const { repo, useCase } = await setup();
    expect(await useCase.execute(undefined, NOW)).toEqual({ requeued: 2 });

    const one = await repo.findById("1", "t1");
    expect(one?.provisionStatus).toBe("failed");
    expect(one?.provisionAttempts).toBe(0);
    expect(one?.provisionError).toBeNull();
    expect(one?.provisionNextAttemptAt).toBe(NOW.toISOString());
    expect((await repo.findProvisionRetryDue(NOW, 10)).map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("limits to the given ids and skips registered or decommissioned devices", async () => {
    const { repo, useCase } = await setup();
    expect(await useCase.execute(["2", "3", "4"], NOW)).toEqual({ requeued: 1 });
    expect((await repo.findById("1", "t1"))?.provisionAttempts).toBe(8);
    expect((await repo.findById("3", "t1"))?.provisionStatus).toBe("registered");
    expect((await repo.findById("4", "t1"))?.provisionAttempts).toBe(8);
  });
});
