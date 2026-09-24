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
  const [firstName, lastName] = fullName.split(" ");
  return {
    id: fullName.toLowerCase().replace(/\s+/g, "-"),
    userId: `user-${fullName}`,
    code: "INS-0001",
    firstName,
    lastName,
    fullName,
    email: `${firstName.toLowerCase()}@fleetpro.ng`,
    phoneNumber: "+2348024117765",
    team: `${state} Installation Team`,
    state,
    city: null,
    serviceAreas: [state],
    capabilities: [],
    photoKey: null,
    notificationPreferences: null,
    status: isActive ? "active" : "suspended",
    maxActiveJobs: 3,
    lastActivityAt: null,
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
  const none = new Map<string, number>();

  it("takes only an installer serving the order's state, case-insensitively", () => {
    const chosen = chooseInstaller(
      [installer("Adaeze Nwosu", "Kano"), installer("Chinedu Okafor", "Lagos")],
      "lagos",
      none,
    );

    expect(chosen?.fullName).toBe("Chinedu Okafor");
  });

  it("leaves the order unassigned when nobody serves the state", () => {
    expect(chooseInstaller([installer("Adaeze Nwosu", "Kano")], "Lagos", none)).toBeNull();
  });

  it("never picks a suspended installer or one who has not signed up", () => {
    const suspended = installer("Chinedu Okafor", "Lagos", false);
    const invited = { ...installer("Musa Ibrahim", "Lagos"), userId: null };

    expect(chooseInstaller([suspended, invited], "Lagos", none)).toBeNull();
  });

  it("skips an installer at capacity", () => {
    const full = installer("Chinedu Okafor", "Lagos");

    expect(chooseInstaller([full], "Lagos", new Map([[full.id, 3]]))).toBeNull();
    expect(chooseInstaller([full], "Lagos", new Map([[full.id, 2]]))?.id).toBe(full.id);
  });

  it("prefers the least busy, then the name", () => {
    const musa = installer("Musa Ibrahim", "Lagos");
    const chinedu = installer("Chinedu Okafor", "Lagos");
    const ada = installer("Ada Obi", "Lagos");
    const load = new Map([[ada.id, 2], [chinedu.id, 1]]);

    expect(chooseInstaller([chinedu, musa, ada], "Lagos", load)?.fullName).toBe("Musa Ibrahim");
    expect(chooseInstaller([chinedu, ada], "Lagos", new Map())?.fullName).toBe("Ada Obi");
  });

  it("answers null rather than picking somebody who cannot do it", () => {
    expect(chooseInstaller([], "Lagos", none)).toBeNull();
  });

  it("gives the same answer for the same candidates", () => {
    const candidates = [
      installer("Musa Ibrahim", "Lagos"),
      installer("Chinedu Okafor", "Lagos"),
    ];

    expect(chooseInstaller(candidates, "Lagos", none)?.fullName).toBe(
      chooseInstaller([...candidates].reverse(), "Lagos", none)?.fullName,
    );
  });
});
