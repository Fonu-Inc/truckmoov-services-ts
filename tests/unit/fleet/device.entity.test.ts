import { describe, expect, it } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";

function makeDevice(overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  return Device.create({
    id: "dev-1",
    imei: "359779090012345",
    manufacturer: "Teltonika",
    model: "FMC130",
    firmwareVersion: "3.28.07",
    tenantId: "tenant-1",
    lifecycleStatus: "registered",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    ...overrides,
  });
}

describe("Device entity", () => {
  it("defaults display status from lifecycle status", () => {
    expect(makeDevice().status).toBe("registered");
    expect(makeDevice({ lifecycleStatus: "assignable" }).status).toBe("active");
  });

  it("rejects invalid imei", () => {
    expect(() => makeDevice({ imei: "gps-1" })).toThrow("imei must be 15 digits");
  });

  it("rejects assigned lifecycle without a vehicle", () => {
    expect(() => makeDevice({ lifecycleStatus: "assigned", vehicleId: null })).toThrow(
      "assigned devices must have a vehicleId",
    );
  });

  it("transitionTo enforces valid lifecycle sequence", () => {
    const configured = makeDevice({ lifecycleStatus: "config_pending" }).transitionTo("configured");
    expect(configured.lifecycleStatus).toBe("configured");
    expect(configured.status).toBe("configured");
    expect(() => makeDevice().transitionTo("assignable")).toThrow(
      "device cannot transition from registered to assignable",
    );
  });

  it("assignToVehicle moves assignable devices into assigned state", () => {
    const assigned = makeDevice({ lifecycleStatus: "assignable" }).assignToVehicle("veh-1");
    expect(assigned.lifecycleStatus).toBe("assigned");
    expect(assigned.status).toBe("assigned");
    expect(assigned.vehicleId).toBe("veh-1");
    expect(assigned.assignedAt).toBeTruthy();
  });

  it("unassignFromVehicle returns device to assignable state", () => {
    const unassigned = makeDevice({
      lifecycleStatus: "assigned",
      vehicleId: "veh-1",
      assignedAt: "2026-03-26T10:00:00.000Z",
    }).unassignFromVehicle();
    expect(unassigned.lifecycleStatus).toBe("assignable");
    expect(unassigned.status).toBe("active");
    expect(unassigned.vehicleId).toBeNull();
    expect(unassigned.assignedAt).toBeNull();
  });

  it("recordFirstTelemetry stores the reported protocol", () => {
    const verified = makeDevice({ verificationStatus: "waiting" }).recordFirstTelemetry(
      "2026-08-25T10:00:00.000Z",
      "teltonika",
    );
    expect(verified.reportedProtocol).toBe("teltonika");
  });

  it("recordFirstTelemetry leaves reportedProtocol null when none is given", () => {
    const verified = makeDevice({ verificationStatus: "waiting" }).recordFirstTelemetry(
      "2026-08-25T10:00:00.000Z",
    );
    expect(verified.reportedProtocol).toBeNull();
  });

  it("keeps an explicit assignment date when the tenant holds the device without a vehicle", () => {
    const held = makeDevice({
      lifecycleStatus: "assignable",
      status: "assigned",
      assignedAt: "2026-11-22T10:00:00.000Z",
    });
    expect(held.assignedAt).toBe("2026-11-22T10:00:00.000Z");
    expect(held.status).toBe("assigned");
    expect(held.vehicleId).toBeNull();
  });

  it("update moves a device to a tenant and records the new protocol", () => {
    const moved = makeDevice().update({
      tenantId: "tenant-2",
      protocol: "MQTT",
      status: "assigned",
      assignedAt: "2026-11-22T10:00:00.000Z",
    });
    expect(moved.tenantId).toBe("tenant-2");
    expect(moved.protocol).toBe("MQTT");
    expect(moved.status).toBe("assigned");
    expect(moved.assignedAt).toBe("2026-11-22T10:00:00.000Z");
  });

  it("update sets reportedProtocol only when explicitly given", () => {
    const withProtocol = makeDevice({ reportedProtocol: "teltonika" });
    expect(withProtocol.update({}).reportedProtocol).toBe("teltonika");
    expect(withProtocol.update({ reportedProtocol: "queclink" }).reportedProtocol).toBe(
      "queclink",
    );
    expect(withProtocol.update({ reportedProtocol: null }).reportedProtocol).toBeNull();
  });
});
