import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GeofenceZonesUseCase } from "../../../apps/fleet/src/geofence-zones.use-case";

function useCase() {
  const repo = {
    findAllByTenant: vi.fn(async () => []),
    findById: vi.fn(async () => ({ id: "z1", tenantId: "t1", coordinates: [], centerLatitude: 6.5, centerLongitude: 3.4, radiusMeters: 100 })),
    save: vi.fn(async () => undefined),
    setVehicleAssignments: vi.fn(async () => undefined),
  };
  const quota = { assertWithinQuota: vi.fn(async () => undefined) };
  const occupancy = { syncZone: vi.fn(async () => undefined) };
  return { repo, zones: Reflect.construct(GeofenceZonesUseCase, [repo, quota, occupancy]) as GeofenceZonesUseCase };
}

const LAGOS_SQUARE: [number, number][] = [[3.38, 6.44], [3.42, 6.44], [3.42, 6.47], [3.38, 6.47]];

describe("geofence zones must be inside Nigeria", () => {
  it("creates a polygon and a circle in Lagos", async () => {
    const { zones } = useCase();

    await expect(zones.create("t1", { name: "Island", coordinates: LAGOS_SQUARE })).resolves.toMatchObject({ shape: "POLYGON" });
    await expect(
      zones.create("t1", { name: "Depot", coordinates: [], center: { latitude: 6.5, longitude: 3.4 }, radiusMeters: 250 }),
    ).resolves.toMatchObject({ shape: "CIRCLE" });
  });

  it.each([
    ["a vertex abroad", { coordinates: [...LAGOS_SQUARE, [-0.12, 51.5]] as [number, number][] }, "Zone must be inside Nigeria"],
    ["a swapped [lat, lng] vertex", { coordinates: [[6.44, 3.38], [6.44, 3.42], [6.47, 3.42]] as [number, number][] }, "Zone must be inside Nigeria"],
    ["a centre abroad", { coordinates: [], center: { latitude: 5.6, longitude: -0.19 }, radiusMeters: 100 }, "Zone must be inside Nigeria"],
    ["a NaN vertex", { coordinates: [[Number.NaN, 6.44]] as [number, number][] }, "Zone coordinates must be valid latitude and longitude numbers"],
    ["a latitude past 90", { coordinates: [[3.4, 91]] as [number, number][] }, "Zone coordinates must be valid latitude and longitude numbers"],
    ["a malformed vertex", { coordinates: [[3.4]] as unknown as [number, number][] }, "Zone coordinates must be valid latitude and longitude numbers"],
  ])("refuses %s on create and update", async (_name, shape, message) => {
    const { zones, repo } = useCase();

    await expect(zones.create("t1", { name: "Bad", ...shape })).rejects.toThrow(new BadRequestException(message));
    await expect(zones.update("t1", "z1", shape)).rejects.toThrow(new BadRequestException(message));
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("lets an update that touches no shape through", async () => {
    const { zones } = useCase();

    await expect(zones.update("t1", "z1", { name: "Renamed" })).resolves.toMatchObject({ name: "Renamed" });
  });
});
