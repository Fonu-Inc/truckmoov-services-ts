import { describe, expect, it } from "vitest";
import { toApiShape } from "../../../apps/fleet/src/geofence-zones.use-case";

const zone = (radiusMeters: number | null) =>
  ({ centerLatitude: 6.44, centerLongitude: 3.38, radiusMeters, coordinates: [[3.38, 6.44]] }) as never;

describe("toApiShape", () => {
  it("reports a zone with a center but no radius as a polygon", () => {
    expect(toApiShape(zone(0)).shape).toBe("POLYGON");
    expect(toApiShape(zone(0)).center).toBeNull();
    expect(toApiShape(zone(250)).shape).toBe("CIRCLE");
  });
});
