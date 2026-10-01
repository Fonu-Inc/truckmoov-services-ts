import { describe, expect, it } from "vitest";
import { CreateDeviceUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/create-device.use-case";
import { SetDeviceLifecycleStatusUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/set-device-lifecycle-status.use-case";
import { DecommissionDeviceUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/decommission-device.use-case";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import type { TraccarDeviceProvisioner } from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/traccar-device.port";
import type {
  DeviceIdentityChangedEvent,
  DeviceIdentityEventPublisher,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/device-identity-event.publisher";

/**
 * Enforces nothing. The quota rules have their own tests; these exercise the
 * behaviour around them.
 */
const unlimitedQuota = { assertWithinQuota: async () => {} } as never;

let counter = 0;
const runtime = {
  generateId: () => `dev-${++counter}`,
  getDefaultTenantId: () => "t1",
} as unknown as never;

class RecordingPublisher implements DeviceIdentityEventPublisher {
  readonly events: DeviceIdentityChangedEvent[] = [];
  async publish(event: DeviceIdentityChangedEvent): Promise<void> {
    this.events.push(event);
  }
}

const okProvisioner: TraccarDeviceProvisioner = {
  async register() {
    return { traccarDeviceId: "tc-99" };
  },
  async deregister() {},
};

const failingProvisioner: TraccarDeviceProvisioner = {
  async register() {
    throw new Error("traccar unreachable");
  },
  async deregister() {},
};

const noopProvisioner: TraccarDeviceProvisioner = {
  async register() {
    return null;
  },
  async deregister() {},
};

function baseCommand() {
  return { imei: "359779090012345", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28.07" };
}

describe("CreateDeviceUseCase provisioning + identity emit", () => {
  it("marks registered and stores the traccar id on success", async () => {
    const repo = new InMemoryDeviceRepository();
    const publisher = new RecordingPublisher();
    const result = await new CreateDeviceUseCase(repo, runtime, okProvisioner, publisher, unlimitedQuota).execute(baseCommand());

    expect(result.provisionStatus).toBe("registered");
    expect(result.traccarDeviceId).toBe("tc-99");
    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0].action).toBe("registered");
    expect(publisher.events[0].imei).toBe("359779090012345");
  });

  it("does not block creation when traccar is unreachable", async () => {
    const repo = new InMemoryDeviceRepository();
    const publisher = new RecordingPublisher();
    const result = await new CreateDeviceUseCase(repo, runtime, failingProvisioner, publisher, unlimitedQuota).execute(baseCommand());

    expect(result.provisionStatus).toBe("failed");
    expect(result.traccarDeviceId).toBeNull();
    expect(await repo.findById(result.id, "t1")).not.toBeNull();
  });

  it("stays pending when no traccar is configured (noop)", async () => {
    const repo = new InMemoryDeviceRepository();
    const publisher = new RecordingPublisher();
    const result = await new CreateDeviceUseCase(repo, runtime, noopProvisioner, publisher, unlimitedQuota).execute(baseCommand());

    expect(result.provisionStatus).toBe("pending");
    expect(result.traccarDeviceId).toBeNull();
  });
});

describe("DecommissionDeviceUseCase", () => {
  it("deregisters from traccar, clears provisioning state, and emits decommissioned", async () => {
    const repo = new InMemoryDeviceRepository();
    await repo.save(
      Device.create({
        id: "d-9",
        imei: "359779090012345",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: "3.28.07",
        tenantId: "t1",
        lifecycleStatus: "faulty",
        vehicleId: null,
        signalStrength: null,
        batteryLevel: null,
        lastSeen: null,
        assignedAt: null,
        traccarDeviceId: "tc-99",
        provisionStatus: "registered",
      }),
    );

    const deregistered: string[] = [];
    const provisioner: TraccarDeviceProvisioner = {
      async register() {
        return null;
      },
      async deregister(id: string) {
        deregistered.push(id);
      },
    };
    const publisher = new RecordingPublisher();
    const vehicleRepo = { findById: async () => null, save: async () => {} } as unknown as never;

    const result = await new DecommissionDeviceUseCase(repo, vehicleRepo, provisioner, publisher).execute("d-9");

    expect(result.provisionStatus).toBe("pending");
    expect(result.traccarDeviceId).toBeNull();
    expect(deregistered).toEqual(["tc-99"]);
    expect(publisher.events.at(-1)?.action).toBe("decommissioned");
    const persisted = await repo.findById("d-9", "t1");
    expect(persisted?.provisionStatus).toBe("pending");
    expect(persisted?.traccarDeviceId).toBeNull();
  });
});

describe("tenant lifecycle moves", () => {
  // Decommissioning is permanent, so it is the platform's call.
  it("refuses to decommission a device", async () => {
    const repo = new InMemoryDeviceRepository();
    await repo.save(
      Device.create({
        id: "d-10", imei: "359779090012399", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28.07",
        tenantId: "t1", lifecycleStatus: "faulty", vehicleId: null, signalStrength: null, batteryLevel: null,
        lastSeen: null, assignedAt: null,
      }),
    );

    await expect(
      new SetDeviceLifecycleStatusUseCase(repo).execute({ id: "d-10", tenantId: "t1", lifecycleStatus: "decommissioned" }),
    ).rejects.toThrow(/cannot transition from faulty to decommissioned/);
  });

  it("brings a repaired faulty device back through configuration", async () => {
    const repo = new InMemoryDeviceRepository();
    await repo.save(
      Device.create({
        id: "d-11", imei: "359779090012398", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28.07",
        tenantId: "t1", lifecycleStatus: "faulty", vehicleId: null, signalStrength: null, batteryLevel: null,
        lastSeen: null, assignedAt: null,
      }),
    );

    const result = await new SetDeviceLifecycleStatusUseCase(repo).execute({ id: "d-11", tenantId: "t1", lifecycleStatus: "configured" });

    expect(result.lifecycleStatus).toBe("configured");
  });
});
