import { describe, expect, it } from "vitest";
import { signBusEvent, type BusHandler, type EventBus, type EventEnvelope } from "@shared/eventbus";
import { DeviceTelemetryListener } from "../../../apps/fleet/src/device-telemetry.listener";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { RecordDeviceTelemetryUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/record-device-telemetry.use-case";

const TENANT = "tenant-1";
const SECRET = "bus-secret";
const config = { eventSigningSecret: SECRET, eventAcceptUnsigned: false } as never;

function makeDevice(overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  return Device.create({
    id: "dev-1",
    imei: "359779090012345",
    manufacturer: "Teltonika",
    model: "FMB920",
    firmwareVersion: "3.28.07",
    tenantId: TENANT,
    lifecycleStatus: "configured",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    verificationStatus: "waiting",
    verificationDeadline: "2026-08-25T12:00:00.000Z",
    ...overrides,
  });
}

class FakeEventBus implements EventBus {
  private handler?: BusHandler;

  async publish(): Promise<void> {}

  async isReady(): Promise<boolean> {
    return true;
  }

  async subscribe(_subject: string, handler: BusHandler) {
    this.handler = handler;
    return async () => {};
  }

  async emit(envelope: EventEnvelope, signed = true) {
    const subject = `tm.${envelope.tenant_id}.vehicle.location.updated`;
    if (this.handler) await this.handler(signed ? signBusEvent(SECRET, subject, envelope) : envelope, { subject });
  }
}

function makeEnvelope(tenantId: string, data: Record<string, unknown>): EventEnvelope {
  return {
    id: "evt-1",
    type: "vehicle.location.updated",
    version: 1,
    occurred_at: "2026-08-25T10:00:00.000Z",
    tenant_id: tenantId,
    data,
  };
}

describe("DeviceTelemetryListener", () => {
  it("records the reported protocol from the event onto the device", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(makeDevice());
    const bus = new FakeEventBus();
    const listener = new DeviceTelemetryListener(bus, new RecordDeviceTelemetryUseCase(devices, { verified: async () => {}, failed: async () => {} }), config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope(TENANT, { device_id: "dev-1", protocol: "teltonika" }));

    const updated = await devices.findById("dev-1", TENANT);
    expect(updated?.reportedProtocol).toBe("teltonika");
    expect(updated?.verificationStatus).toBe("verified");
  });

  it("leaves reportedProtocol untouched when the event carries none", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(makeDevice({ verificationStatus: "verified", reportedProtocol: "teltonika" }));
    const bus = new FakeEventBus();
    const listener = new DeviceTelemetryListener(bus, new RecordDeviceTelemetryUseCase(devices, { verified: async () => {}, failed: async () => {} }), config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope(TENANT, { device_id: "dev-1" }));

    const updated = await devices.findById("dev-1", TENANT);
    expect(updated?.reportedProtocol).toBe("teltonika");
  });

  it("ignores an event with neither device id nor imei", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(makeDevice());
    const bus = new FakeEventBus();
    const listener = new DeviceTelemetryListener(bus, new RecordDeviceTelemetryUseCase(devices, { verified: async () => {}, failed: async () => {} }), config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope(TENANT, { protocol: "teltonika" }));

    const unchanged = await devices.findById("dev-1", TENANT);
    expect(unchanged?.reportedProtocol).toBeNull();
  });

  it("ignores an unsigned event", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(makeDevice());
    const bus = new FakeEventBus();
    const listener = new DeviceTelemetryListener(bus, new RecordDeviceTelemetryUseCase(devices, { verified: async () => {}, failed: async () => {} }), config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope(TENANT, { device_id: "dev-1", protocol: "teltonika" }), false);

    const unchanged = await devices.findById("dev-1", TENANT);
    expect(unchanged?.reportedProtocol).toBeNull();
  });
});
