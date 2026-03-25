import { describe, expect, it } from "vitest";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";

function makeVehicle(overrides: Partial<Parameters<typeof Vehicle.create>[0]> = {}) {
  return Vehicle.create({
    id: "v1",
    plateNumber: "LND-001-XY",
    vin: null,
    make: null,
    model: "Mercedes Actros",
    year: null,
    type: null,
    capacity: null,
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

  it("normalizes vin to uppercase and mirrors registrationNumber", () => {
    const vehicle = makeVehicle({
      plateNumber: "lag-123-xy",
      vin: "1hgcm82633a123456",
    });
    expect(vehicle.registrationNumber).toBe("LAG-123-XY");
    expect(vehicle.vin).toBe("1HGCM82633A123456");
  });

  it("throws for empty plateNumber", () => {
    expect(() => makeVehicle({ plateNumber: "  " })).toThrow("plateNumber is required");
  });

  it("throws for empty model", () => {
    expect(() => makeVehicle({ model: "" })).toThrow("model is required");
  });

  it("throws for invalid vin length", () => {
    expect(() => makeVehicle({ vin: "SHORT-VIN" })).toThrow("vin must be 17 characters");
  });

  it("throws for invalid year", () => {
    expect(() => makeVehicle({ year: 1989 })).toThrow("year must be between 1990");
  });

  it("throws for invalid type", () => {
    expect(() => makeVehicle({ type: "bus" as any })).toThrow("type must be one of: truck, van, trailer");
  });

  it("throws for negative capacity", () => {
    expect(() => makeVehicle({ capacity: -1 })).toThrow("capacity must be zero or greater");
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
    const v = makeVehicle().registerGpsDevice({ imei: "359779090012345", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28.07", installedAt: "" });
    expect(v.gpsDevice?.imei).toBe("359779090012345");
  });

  it("rejects gps devices with invalid imei", () => {
    expect(() =>
      makeVehicle().registerGpsDevice({
        imei: "gps-1",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: "3.28.07",
        installedAt: "",
      }),
    ).toThrow("gps device imei must be 15 digits");
  });

  it("clearGpsDevice removes device", () => {
    const v = makeVehicle()
      .registerGpsDevice({ imei: "359779090012345", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28.07", installedAt: "" })
      .clearGpsDevice();
    expect(v.gpsDevice).toBeNull();
  });

  it("toPrimitives returns plain object", () => {
    const p = makeVehicle({
      vin: "1HGCM82633A123456",
      make: "Mercedes-Benz",
      year: 2026,
      type: "truck",
      capacity: 20,
    }).toPrimitives();
    expect(p.id).toBe("v1");
    expect(p.status).toBe("active");
    expect(p.registrationNumber).toBe("LND-001-XY");
    expect(p.vin).toBe("1HGCM82633A123456");
    expect(p.make).toBe("Mercedes-Benz");
    expect(p.year).toBe(2026);
    expect(p.type).toBe("truck");
    expect(p.capacity).toBe(20);
  });
});
