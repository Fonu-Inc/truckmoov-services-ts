import { describe, expect, it } from "vitest";
import {
  positionTimestamp,
  toVehiclePositions,
} from "../../../apps/fleet/src/contexts/fleet/reports/infrastructure/http-vehicle-positions-reader";

describe("tracking snapshot field names", () => {
  it("reads the names tracking actually sends", () => {
    const [position] = toVehiclePositions([
      { vehicle_id: "v1", latitude: 6.5, longitude: 3.4, speed_kph: 40, observed_at: "2026-02-02T11:00:05Z", fix_time: "2026-02-02T11:00:00Z" },
    ]);
    expect(position).toMatchObject({ vehicleId: "v1", recordedAt: "2026-02-02T11:00:05Z", speedKph: 40 });
  });

  it("falls back to fix_time, then the older names", () => {
    expect(positionTimestamp({ fix_time: "2026-02-02T11:00:00Z" })).toBe("2026-02-02T11:00:00Z");
    expect(positionTimestamp({ recorded_at: "2026-02-02T10:00:00Z" })).toBe("2026-02-02T10:00:00Z");
    expect(positionTimestamp({ occurred_at: "2026-02-02T09:00:00Z" })).toBe("2026-02-02T09:00:00Z");
    expect(positionTimestamp({})).toBe("");
  });

  it("drops rows with no coordinates", () => {
    expect(toVehiclePositions([{ vehicle_id: "v1", observed_at: "2026-02-02T11:00:00Z" }])).toEqual([]);
  });
});
