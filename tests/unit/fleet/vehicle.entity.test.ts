import { describe, expect, it } from "vitest";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";

function makeVehicle(overrides: Partial<Parameters<typeof Vehicle.create>[0]> = {}) {
  return Vehicle.create({
    id: "v1",
    plateNumber: "LND-001-XY",
    model: "Mercedes Actros",
    tenantId: "tenant-1",
    status: "active",
    assignedDriverId: null,
    gpsDevice: null,
    ...overrides,
  });
}

describe("Vehicle entity", () => {
  it("normalizes plateNumber to uppercase", () => {
    expect(makeVehicle({ plateNumber: "lnd-001-xy" }).plateNumber).toBe("LND-001-XY");
  });

  it("trims model and tenantId", () => {
    const v = makeVehicle({ model: "  Volvo FH  ", tenantId: "  t1  " });
    expect(v.model).toBe("Volvo FH");
    expect(v.tenantId).toBe("t1");
  });

  it("throws for empty plateNumber", () => {
    expect(() => makeVehicle({ plateNumber: "  " })).toThrow("plateNumber is required");
  });

  it("throws for empty model", () => {
    expect(() => makeVehicle({ model: "" })).toThrow("model is required");
  });

  it("throws for invalid status", () => {
    expect(() => makeVehicle({ status: "broken" as any })).toThrow("status must be one of");
  });

  it("assignDriver returns new instance with driverId", () => {
    const v = makeVehicle();
    const assigned = v.assignDriver("d1");
    expect(assigned.assignedDriverId).toBe("d1");
    expect(v.assignedDriverId).toBeNull();
  });

  it("unassignDriver clears driverId", () => {
    expect(makeVehicle().assignDriver("d1").unassignDriver().assignedDriverId).toBeNull();
  });

  it("setStatus inactive clears assignedDriverId", () => {
    const v = makeVehicle().assignDriver("d1").setStatus("inactive");
    expect(v.status).toBe("inactive");
    expect(v.assignedDriverId).toBeNull();
  });

  it("registerGpsDevice sets device", () => {
    const v = makeVehicle().registerGpsDevice({ deviceId: "gps-1", provider: "teltonika", serialNumber: "SN-001", installedAt: "" });
    expect(v.gpsDevice?.deviceId).toBe("gps-1");
  });

  it("clearGpsDevice removes device", () => {
    const v = makeVehicle()
      .registerGpsDevice({ deviceId: "g1", provider: "p", serialNumber: "s", installedAt: "" })
      .clearGpsDevice();
    expect(v.gpsDevice).toBeNull();
  });

  it("toPrimitives returns plain object", () => {
    const p = makeVehicle().toPrimitives();
    expect(p.id).toBe("v1");
    expect(p.status).toBe("active");
  });
});
