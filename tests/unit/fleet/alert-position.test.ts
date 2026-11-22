import { describe, expect, it } from "vitest";
import { alertPosition } from "../../../apps/fleet/src/contexts/fleet/tracking/domain/alert-position";

describe("alertPosition", () => {
  it("reads fleet's lat/lng and tracking's latitude/longitude", () => {
    expect(alertPosition({ lat: 6.5, lng: 3.4 })).toEqual({ latitude: 6.5, longitude: 3.4 });
    expect(alertPosition({ latitude: "6.5", longitude: "3.4" })).toEqual({ latitude: 6.5, longitude: 3.4 });
  });

  it("is null when either half is missing or out of range", () => {
    expect(alertPosition({ lat: 6.5 })).toEqual({ latitude: null, longitude: null });
    expect(alertPosition({ lat: 95, lng: 3 })).toEqual({ latitude: null, longitude: null });
    expect(alertPosition(null)).toEqual({ latitude: null, longitude: null });
  });
});
