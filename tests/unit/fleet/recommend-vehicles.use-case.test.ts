import { describe, expect, it, vi } from "vitest";
import { RecommendVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/dispatch/application/recommend-vehicles.use-case";
import { Vehicle } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/entities/vehicle.entity";
import { VehicleHealthService } from "../../../apps/fleet/src/vehicle-health.service";

function vehicle(id: string, overrides: Partial<{ capacity: number | null; type: string; fuelType: string; status: string }> = {}) {
  return Vehicle.create({
    id, plateNumber: `P-${id}`, model: "Truck", tenantId: "t1", status: (overrides.status ?? "active") as any,
    type: (overrides.type ?? "truck") as any, fuelType: (overrides.fuelType ?? "diesel") as any,
    capacity: overrides.capacity === undefined ? 10 : overrides.capacity,
    vin: null, make: null, year: null, assignedDriverId: null, gpsDevice: null,
  });
}

function build(vehicles: Vehicle[], jobs: Array<{ assignedVehicleId: string | null; status: string }> = []) {
  const vehicleRepo = { findAll: vi.fn().mockResolvedValue(vehicles) };
  const dispatchJobs = { listJobs: vi.fn().mockResolvedValue(jobs) };
  const health = new VehicleHealthService();
  return { uc: new RecommendVehiclesUseCase(vehicleRepo as any, dispatchJobs as any, health), health };
}

describe("RecommendVehiclesUseCase", () => {
  it("ranks a vehicle that carries the load above one that cannot", async () => {
    const { uc } = build([vehicle("small", { capacity: 2 }), vehicle("big", { capacity: 10 })]);

    const ranked = await uc.execute("t1", { requiredWeightKg: 8500 });

    expect(ranked[0].vehicleId).toBe("big");
    expect(ranked[0].reasons).toContain("capacity 10000kg vs 8500kg needed");
  });

  it("sinks a vehicle on an assigned job", async () => {
    const { uc } = build([vehicle("v1"), vehicle("v2")], [{ assignedVehicleId: "v1", status: "assigned" }]);

    const ranked = await uc.execute("t1", {});

    expect(ranked[0].vehicleId).toBe("v2");
    expect(ranked.find((r) => r.vehicleId === "v1")?.reasons).toContain("on active dispatch job");
  });

  it("frees a vehicle once its job is delivered", async () => {
    const { uc } = build([vehicle("v1")], [{ assignedVehicleId: "v1", status: "delivered" }]);

    const [ranked] = await uc.execute("t1", {});

    expect(ranked.reasons).not.toContain("on active dispatch job");
  });

  it("sinks a vehicle in maintenance", async () => {
    const { uc } = build([vehicle("shop", { status: "maintenance" }), vehicle("ready")]);

    const ranked = await uc.execute("t1", {});

    expect(ranked[0].vehicleId).toBe("ready");
  });

  it("prefers the requested type and fuel", async () => {
    const { uc } = build([vehicle("van", { type: "van", fuelType: "petrol" }), vehicle("truck", { type: "truck", fuelType: "diesel" })]);

    const [best] = await uc.execute("t1", { vehicleType: "truck", fuelType: "diesel" });

    expect(best.vehicleId).toBe("truck");
    expect(best.reasons).toEqual(expect.arrayContaining(["type match: truck", "fuel match: diesel"]));
  });

  it("rewards proximity when pickup coords and a recent fix exist", async () => {
    const { uc, health } = build([vehicle("far"), vehicle("near")]);
    health.touch("near", Date.now(), null, 6.5, 3.4);
    health.touch("far", Date.now(), null, 7.5, 4.4);

    const ranked = await uc.execute("t1", { pickupLat: 6.5, pickupLng: 3.4 });

    expect(ranked[0].vehicleId).toBe("near");
    expect(ranked[0].distanceKm).toBeLessThan(ranked[1].distanceKm!);
  });

  it("honours the limit", async () => {
    const { uc } = build([vehicle("a"), vehicle("b"), vehicle("c")]);

    expect(await uc.execute("t1", { limit: 2 })).toHaveLength(2);
  });
});
