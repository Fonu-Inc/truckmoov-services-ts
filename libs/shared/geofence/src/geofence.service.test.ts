import { describe, expect, it } from "vitest";
import { GeofenceService } from "./geofence.service";

describe("GeofenceService", () => {
  it("flags points outside the stored bounding box", () => {
    const svc = new GeofenceService();
    svc.set("vehicle-1", {
      northeast: { lat: 10, lng: 10 },
      southwest: { lat: 0, lng: 0 },
    });

    expect(svc.isInside("vehicle-1", { lat: 5, lng: 5 })).toBe(true);
    expect(svc.isInside("vehicle-1", { lat: 11, lng: 5 })).toBe(false);
  });
});
