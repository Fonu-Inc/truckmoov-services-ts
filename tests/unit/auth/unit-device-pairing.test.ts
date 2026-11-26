import { describe, expect, it } from "vitest";
import { pairUnitsWithDevices } from "@auth/installation/domain/unit-device-pairing";
import type { StoredDeviceAssignment } from "@auth/installation/domain/installation-order.repository";

const unit = (deviceIndex: number, fleetDeviceId: string | null = null): StoredDeviceAssignment => ({
  id: `u${deviceIndex}`,
  orderId: "o1",
  deviceIndex,
  vehicleId: `v${deviceIndex}`,
  fleetDeviceId,
  createdAt: new Date("2026-11-01T00:00:00Z"),
});

describe("pairUnitsWithDevices", () => {
  it("fits devices to unbound units in unit order", () => {
    const bound = pairUnitsWithDevices([unit(2), unit(1)], ["d1", "d2"]);
    expect(bound.map((u) => [u.deviceIndex, u.fleetDeviceId])).toEqual([[1, "d1"], [2, "d2"]]);
  });

  it("leaves units that already have a device alone", () => {
    const bound = pairUnitsWithDevices([unit(1, "dx"), unit(2)], ["d1"]);
    expect(bound.map((u) => [u.deviceIndex, u.fleetDeviceId])).toEqual([[2, "d1"]]);
  });

  it("binds only as many as there are devices, and ignores a repeated id", () => {
    const bound = pairUnitsWithDevices([unit(1), unit(2), unit(3)], ["d1", "d1", "d2"]);
    expect(bound.map((u) => u.fleetDeviceId)).toEqual(["d1", "d2"]);
  });

  it("binds nothing without devices", () => {
    expect(pairUnitsWithDevices([unit(1)], [])).toEqual([]);
  });
});
