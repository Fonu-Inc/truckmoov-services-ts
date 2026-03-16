import { describe, expect, it } from "vitest";
import { VehicleHealthService } from "./vehicle-health.service";

describe("VehicleHealthService", () => {
  it("stores timestamps and reports null when absent", () => {
    const svc = new VehicleHealthService();
    expect(svc.get("veh1")).toBeNull();
    svc.touch("veh1", 1000);
    expect(svc.get("veh1")).toBe(1000);
    expect(svc.list()).toEqual([{ vehicleId: "veh1", lastSeen: 1000 }]);
  });
});
