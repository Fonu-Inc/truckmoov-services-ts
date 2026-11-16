import { describe, expect, it } from "vitest";
import { SimDeviceInfoListener } from "../../../apps/auth/src/sim-device-info.listener";
import type { SimRepository, StoredSim } from "../../../apps/auth/src/sim.repository";
import { signBusEvent, type BusHandler, type EventBus, type EventEnvelope } from "@shared/eventbus";
import type { SimChangedEventPublisher } from "../../../apps/auth/src/sim-changed-event.publisher";

function makeSim(overrides: Partial<StoredSim> = {}): StoredSim {
  return {
    id: "sim-1",
    iccid: "8901",
    imsi: null,
    msisdn: null,
    carrier: "MTN",
    plan: "iot_basic",
    status: "active",
    tenantId: "tenant-a",
    deviceId: "device-1",
    deviceName: "old-name",
    deviceImei: null,
    deviceType: null,
    vehicleId: null,
    suspensionReason: null,
    notes: null,
    dataUsageMb: 0,
    dataLimitMb: 100,
    smsUsage: 0,
    smsLimit: 0,
    monthlyCostNgn: 0,
    activationDate: null,
    expiryDate: null,
    lastActivity: null,
    signalStrength: null,
    networkType: null,
    roaming: false,
    fonuSimId: null,
    fonuStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class FakeSimRepository implements SimRepository {
  private store = new Map<string, StoredSim>();
  saved: StoredSim[] = [];

  seed(sim: StoredSim) {
    this.store.set(sim.id, sim);
  }

  async findAll() {
    return { items: [...this.store.values()], total: this.store.size };
  }

  async findById(id: string) {
    return this.store.get(id) ?? null;
  }

  async findByIccid() {
    return null;
  }

  async findByIccids() {
    return [];
  }

  async findByDeviceIds() {
    return [];
  }

  async save(sim: StoredSim) {
    this.store.set(sim.id, sim);
    this.saved.push(sim);
  }

  async delete(id: string) {
    this.store.delete(id);
  }

  async countByStatus() {
    return {};
  }

  async countByCarrier() {
    return {};
  }

  async countUnassigned() {
    return 0;
  }
}

const SECRET = "bus-secret";
const config = { eventSigningSecret: SECRET, eventAcceptUnsigned: false } as never;
const subject = (tenantId: string) => `tm.${tenantId}.fleet.device.updated`;

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
    const s = subject(envelope.tenant_id);
    if (this.handler) await this.handler(signed ? signBusEvent(SECRET, s, envelope) : envelope, { subject: s });
  }
}

class FakeSimChangedPublisher implements SimChangedEventPublisher {
  events: unknown[] = [];
  async publish(event: unknown) {
    this.events.push(event);
  }
}

function makeEnvelope(tenantId: string, data: Record<string, unknown>): EventEnvelope {
  return {
    id: "evt-1",
    type: "fleet.device.updated",
    version: 1,
    occurred_at: new Date().toISOString(),
    tenant_id: tenantId,
    data,
  };
}

describe("SimDeviceInfoListener", () => {
  it("updates the SIM when the event's tenant matches the SIM's tenant", async () => {
    const repo = new FakeSimRepository();
    repo.seed(makeSim({ id: "sim-1", tenantId: "tenant-a", deviceName: "old-name" }));
    const bus = new FakeEventBus();
    const publisher = new FakeSimChangedPublisher();
    const listener = new SimDeviceInfoListener(bus, repo, publisher, config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope("tenant-a", { simId: "sim-1", deviceName: "new-name" }));

    const updated = await repo.findById("sim-1");
    expect(updated?.deviceName).toBe("new-name");
    expect(repo.saved).toHaveLength(1);
  });

  it("rejects the update when the event's tenant does not match the SIM's tenant", async () => {
    const repo = new FakeSimRepository();
    repo.seed(makeSim({ id: "sim-1", tenantId: "tenant-a", deviceName: "old-name" }));
    const bus = new FakeEventBus();
    const publisher = new FakeSimChangedPublisher();
    const listener = new SimDeviceInfoListener(bus, repo, publisher, config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope("tenant-b", { simId: "sim-1", deviceName: "hijacked-name" }));

    const unchanged = await repo.findById("sim-1");
    expect(unchanged?.deviceName).toBe("old-name");
    expect(repo.saved).toHaveLength(0);
  });

  it("rejects the update when the SIM is unassigned inventory", async () => {
    const repo = new FakeSimRepository();
    repo.seed(makeSim({ id: "sim-1", tenantId: null, deviceName: "old-name" }));
    const bus = new FakeEventBus();
    const publisher = new FakeSimChangedPublisher();
    const listener = new SimDeviceInfoListener(bus, repo, publisher, config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope("tenant-a", { simId: "sim-1", deviceName: "new-name" }));

    expect((await repo.findById("sim-1"))?.deviceName).toBe("old-name");
    expect(repo.saved).toHaveLength(0);
  });

  it("ignores an unsigned event", async () => {
    const repo = new FakeSimRepository();
    repo.seed(makeSim({ id: "sim-1", tenantId: "tenant-a", deviceName: "old-name" }));
    const bus = new FakeEventBus();
    const listener = new SimDeviceInfoListener(bus, repo, new FakeSimChangedPublisher(), config);
    await listener.onApplicationBootstrap();

    await bus.emit(makeEnvelope("tenant-a", { simId: "sim-1", deviceName: "new-name" }), false);

    expect(repo.saved).toHaveLength(0);
  });
});
