import { describe, expect, it } from "vitest";
import {
  assertAssignments,
  assertSchedulable,
  DeviceAssignmentMismatchError,
  InvalidInstallationDateError,
  MAX_LEAD_TIME_DAYS,
  VehicleAlreadyAssignedError,
} from "@auth/installation/domain/installation-order";
import { chooseInstaller } from "@auth/installation/domain/assign-installer";
import type { StoredInstaller } from "@auth/installation/domain/installer.repository";

const NOW = new Date("2026-09-22T09:00:00Z");

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function installer(
  fullName: string,
  state: string,
  isActive = true,
): StoredInstaller {
  return {
    id: fullName.toLowerCase().replace(/\s+/g, "-"),
    fullName,
    email: `${fullName.split(" ")[0].toLowerCase()}@fleetpro.ng`,
    phoneNumber: "+2348024117765",
    team: `${state} Installation Team`,
    state,
    isActive,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("Scheduling a date", () => {
  it("accepts a date inside the booking window", () => {
    expect(() => assertSchedulable(inDays(3), NOW)).not.toThrow();
  });

  it("refuses today, which an installer cannot be dispatched against", () => {
    expect(() => assertSchedulable(inDays(0), NOW)).toThrow(
      InvalidInstallationDateError,
    );
  });

  it("refuses a date in the past", () => {
    expect(() => assertSchedulable(inDays(-1), NOW)).toThrow(
      InvalidInstallationDateError,
    );
  });

  it("refuses a date beyond the booking horizon", () => {
    expect(() =>
      assertSchedulable(inDays(MAX_LEAD_TIME_DAYS + 1), NOW),
    ).toThrow(InvalidInstallationDateError);
  });

  it("refuses something that is not a date at all", () => {
    expect(() => assertSchedulable(new Date("not a date"), NOW)).toThrow(
      InvalidInstallationDateError,
    );
  });
});

describe("Assigning devices to vehicles", () => {
  const vehicles = new Set(["v1", "v2", "v3"]);

  it("accepts one device per vehicle", () => {
    expect(() =>
      assertAssignments(
        [
          { deviceIndex: 1, vehicleId: "v1" },
          { deviceIndex: 2, vehicleId: "v2" },
        ],
        2,
        vehicles,
      ),
    ).not.toThrow();
  });

  it("refuses two devices on one vehicle", () => {
    expect(() =>
      assertAssignments(
        [
          { deviceIndex: 1, vehicleId: "v1" },
          { deviceIndex: 2, vehicleId: "v1" },
        ],
        2,
        vehicles,
      ),
    ).toThrow(VehicleAlreadyAssignedError);
  });

  it("refuses a partial assignment", () => {
    expect(() =>
      assertAssignments([{ deviceIndex: 1, vehicleId: "v1" }], 2, vehicles),
    ).toThrow(DeviceAssignmentMismatchError);
  });

  it("refuses a vehicle that is not on the application", () => {
    expect(() =>
      assertAssignments([{ deviceIndex: 1, vehicleId: "stranger" }], 1, vehicles),
    ).toThrow(DeviceAssignmentMismatchError);
  });

  it("refuses a device that is not on the order", () => {
    expect(() =>
      assertAssignments([{ deviceIndex: 7, vehicleId: "v1" }], 1, vehicles),
    ).toThrow(DeviceAssignmentMismatchError);
  });

  it("refuses the same device twice", () => {
    expect(() =>
      assertAssignments(
        [
          { deviceIndex: 1, vehicleId: "v1" },
          { deviceIndex: 1, vehicleId: "v2" },
        ],
        2,
        vehicles,
      ),
    ).toThrow(DeviceAssignmentMismatchError);
  });
});

describe("Choosing an installer", () => {
  it("prefers one working the installation's own state", () => {
    const chosen = chooseInstaller(
      [installer("Adaeze Nwosu", "Kano"), installer("Chinedu Okafor", "Lagos")],
      "Lagos",
    );

    expect(chosen?.fullName).toBe("Chinedu Okafor");
  });

  it("falls back to any active installer when none covers the state", () => {
    const chosen = chooseInstaller([installer("Adaeze Nwosu", "Kano")], "Lagos");

    expect(chosen?.fullName).toBe("Adaeze Nwosu");
  });

  it("never picks an inactive installer", () => {
    expect(
      chooseInstaller([installer("Chinedu Okafor", "Lagos", false)], "Lagos"),
    ).toBeNull();
  });

  it("answers null rather than picking somebody who cannot do it", () => {
    expect(chooseInstaller([], "Lagos")).toBeNull();
  });

  it("gives the same answer for the same candidates", () => {
    const candidates = [
      installer("Musa Ibrahim", "Lagos"),
      installer("Chinedu Okafor", "Lagos"),
    ];

    expect(chooseInstaller(candidates, "Lagos")?.fullName).toBe(
      chooseInstaller([...candidates].reverse(), "Lagos")?.fullName,
    );
  });
});
