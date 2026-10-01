import { describe, expect, it, vi } from "vitest";
import { RecommendDriversUseCase } from "../../../apps/fleet/src/contexts/fleet/dispatch/application/recommend-drivers.use-case";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { VehicleHealthService } from "../../../apps/fleet/src/vehicle-health.service";

function driver(id: string, status: string, vehicleId: string | null) {
  return Driver.create({
    id, name: `Driver ${id}`, licenseNumber: `L-${id}`, tenantId: "t1", status: status as any,
    assignedVehicleId: vehicleId, contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null },
  });
}

function vehicle(id: string, capacity: number | null, type: string | null) {
  return Vehicle.create({
    id, plateNumber: `P-${id}`, model: "Truck", tenantId: "t1", status: "active",
    type: type as any, capacity, vin: null, make: null, year: null, assignedDriverId: null, gpsDevice: null,
  });
}

function build(drivers: Driver[], vehicles: Vehicle[], jobs: Array<{ assignedDriverId: string | null; status: string }> = []) {
  const driverRepo = { findAll: vi.fn().mockResolvedValue(drivers) };
  const vehicleRepo = { findAll: vi.fn().mockResolvedValue(vehicles) };
  const dispatchJobs = { listJobs: vi.fn().mockResolvedValue(jobs) };
  const health = new VehicleHealthService();
  return { uc: new RecommendDriversUseCase(driverRepo as any, vehicleRepo as any, dispatchJobs as any, health), health };
}

describe("RecommendDriversUseCase", () => {
  it("ranks an available, capacity-fit driver above an offline one", async () => {
    const { uc } = build(
      [driver("d1", "available", "v1"), driver("d2", "offline", "v2")],
      [vehicle("v1", 10, "truck"), vehicle("v2", 10, "truck")],
    );
    const ranked = await uc.execute("t1", { requiredCapacity: 5, vehicleType: "truck" });
    expect(ranked[0].driverId).toBe("d1");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("excludes suspended drivers", async () => {
    const { uc } = build([driver("d1", "suspended", "v1"), driver("d2", "available", "v2")], [vehicle("v1", 10, "truck"), vehicle("v2", 10, "truck")]);
    const ranked = await uc.execute("t1", {});
    expect(ranked.map((r) => r.driverId)).toEqual(["d2"]);
  });

  it("penalises a vehicle under the required capacity", async () => {
    const { uc } = build(
      [driver("d1", "available", "v1"), driver("d2", "available", "v2")],
      [vehicle("v1", 20, "truck"), vehicle("v2", 2, "truck")],
    );
    const ranked = await uc.execute("t1", { requiredCapacity: 10 });
    expect(ranked[0].driverId).toBe("d1");
  });

  it("rewards proximity when pickup coords and a recent fix exist", async () => {
    const { uc, health } = build(
      [driver("near", "available", "v1"), driver("far", "available", "v2")],
      [vehicle("v1", 10, "truck"), vehicle("v2", 10, "truck")],
    );
    health.touch("v1", Date.now(), null, 6.5, 3.4);
    health.touch("v2", Date.now(), null, 7.5, 4.4);
    const ranked = await uc.execute("t1", { pickupLat: 6.5, pickupLng: 3.4 });
    expect(ranked[0].driverId).toBe("near");
    expect(ranked[0].distanceKm).toBeLessThan(ranked[1].distanceKm!);
  });

  it("deprioritises a driver already on an active dispatch job", async () => {
    const { uc } = build(
      [driver("d1", "available", "v1"), driver("d2", "available", "v2")],
      [vehicle("v1", 10, "truck"), vehicle("v2", 10, "truck")],
      [{ assignedDriverId: "d1", status: "en-route" }],
    );
    const ranked = await uc.execute("t1", {});
    expect(ranked[0].driverId).toBe("d2");
    expect(ranked.find((r) => r.driverId === "d1")?.reasons).toContain("on active dispatch job");
  });

  // Dispatch's in_progress filter no longer includes assigned jobs, so the
  // busy check cannot lean on it.
  it("treats a driver on an assigned job as busy", async () => {
    const { uc } = build(
      [driver("d1", "available", "v1")],
      [vehicle("v1", 10, "truck")],
      [{ assignedDriverId: "d1", status: "assigned" }],
    );
    const [ranked] = await uc.execute("t1", {});
    expect(ranked.reasons).toContain("on active dispatch job");
  });

  it("frees a driver once their job is delivered", async () => {
    const { uc } = build(
      [driver("d1", "available", "v1")],
      [vehicle("v1", 10, "truck")],
      [{ assignedDriverId: "d1", status: "delivered" }],
    );
    const [ranked] = await uc.execute("t1", {});
    expect(ranked.reasons).not.toContain("on active dispatch job");
  });
});

describe("capacity is compared in kg", () => {
  // A vehicle's capacity is stored in its own unit; comparing the raw number
  // against tonnes ranked a 5000 kg van as carrying 5000 t.
  it("ranks a kg-rated vehicle against a weight in kg", async () => {
    const van = Vehicle.create({
      id: "v1", plateNumber: "P-v1", model: "Van", tenantId: "t1", status: "active", type: "van" as any,
      capacity: 5000, capacityUnit: "kg", vin: null, make: null, year: null, assignedDriverId: null, gpsDevice: null,
    } as never);
    const { uc } = build([driver("d1", "available", "v1")], [van]);

    const [small] = await uc.execute("t1", { requiredWeightKg: 8000 });
    const [enough] = await uc.execute("t1", { requiredCapacity: 4 });

    expect(small.reasons).toContain("capacity 5000kg vs 8000kg needed");
    expect(enough.reasons).toContain("capacity 5000kg vs 4000kg needed");
    expect(enough.score).toBeGreaterThan(small.score);
  });
});
