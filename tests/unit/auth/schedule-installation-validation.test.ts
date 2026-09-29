import { describe, expect, it, vi } from "vitest";
import {
  assertAssignments,
  assertSchedulable,
  DeviceAssignmentMismatchError,
  InvalidInstallationDateError,
  VehicleAlreadyAssignedError,
} from "@auth/installation/domain/installation-order";
import {
  InstallationNotSchedulableError,
  ScheduleInstallationUseCase,
} from "@auth/installation/application/use-cases/schedule-installation.use-case";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";

function thrown(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
}

describe("installation date errors name their field", () => {
  const now = new Date("2026-09-29T09:00:00Z");
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);

  it.each([
    ["today", () => assertSchedulable(day(0), now)],
    ["more than 90 days out", () => assertSchedulable(day(91), now)],
    ["not a date", () => assertSchedulable(new Date("nope"), now)],
  ])("%s is reported under scheduledDate", (_name, act) => {
    const error = thrown(act) as InvalidInstallationDateError;

    expect(error).toBeInstanceOf(InvalidInstallationDateError);
    expect(error.field).toBe("scheduledDate");
  });
});

describe("assignment errors name their field, and the device where there is one", () => {
  const vehicles = new Set(["v1", "v2"]);

  it("reports a count mismatch under assignments with no device", () => {
    const error = thrown(() => assertAssignments([{ deviceIndex: 1, vehicleId: "v1" }], 2, vehicles)) as DeviceAssignmentMismatchError;

    expect(error.field).toBe("assignments");
    expect(error.deviceIndex).toBeUndefined();
  });

  it("names the device that was assigned twice", () => {
    const error = thrown(() =>
      assertAssignments(
        [
          { deviceIndex: 1, vehicleId: "v1" },
          { deviceIndex: 1, vehicleId: "v2" },
        ],
        2,
        vehicles,
      ),
    ) as DeviceAssignmentMismatchError;

    expect(error.field).toBe("assignments");
    expect(error.deviceIndex).toBe(1);
  });

  it("names the device given a vehicle that is not on the application", () => {
    const error = thrown(() => assertAssignments([{ deviceIndex: 1, vehicleId: "stranger" }], 1, vehicles)) as DeviceAssignmentMismatchError;

    expect(error.deviceIndex).toBe(1);
  });

  it("names the device that is not on the order", () => {
    const error = thrown(() => assertAssignments([{ deviceIndex: 7, vehicleId: "v1" }], 1, vehicles)) as DeviceAssignmentMismatchError;

    expect(error.deviceIndex).toBe(7);
  });

  it("names the second device when one vehicle takes two", () => {
    const error = thrown(() =>
      assertAssignments(
        [
          { deviceIndex: 1, vehicleId: "v1" },
          { deviceIndex: 2, vehicleId: "v1" },
        ],
        2,
        vehicles,
      ),
    ) as VehicleAlreadyAssignedError;

    expect(error).toBeInstanceOf(VehicleAlreadyAssignedError);
    expect(error.field).toBe("assignments");
    expect(error.deviceIndex).toBe(2);
  });
});

describe("scheduling checks the body before the stage", () => {
  const application = (stage: string) => ({ id: "a1", stage, tenantId: "t1" }) as never;

  function useCaseAt(stage: string) {
    const applications = {
      findDeviceRequestsByApplicationId: vi.fn(async () => [{ quantity: 1 }]),
      findVehiclesByApplicationId: vi.fn(async () => [{ id: "v1" }]),
    };
    const orders = { findByApplicationId: vi.fn(async () => null) };
    return Reflect.construct(ScheduleInstallationUseCase, [
      applications,
      orders,
      {},
      { resolve: vi.fn(async () => application(stage)) },
      {},
      { generate: () => "id" },
      {},
    ]) as ScheduleInstallationUseCase;
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    applicationId: "a1",
    applicationToken: "t",
    scheduledDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    timeSlot: "morning",
    addressLine: "12 Mazi Fedelis Street",
    city: "Lagos",
    state: "Lagos",
    siteContactName: "Victor Akaaha",
    siteContactPhone: "+2347041386799",
    assignments: [{ deviceIndex: 1, vehicleId: "v1" }],
    ...overrides,
  });

  it("answers a bad date with the date error at the application stage", async () => {
    const error = await useCaseAt("application").execute(body({ scheduledDate: "2020-01-01" })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidInstallationDateError);
  });

  it("answers duplicate assignments with the assignment error at the application stage", async () => {
    const error = await useCaseAt("application")
      .execute(body({ assignments: [{ deviceIndex: 1, vehicleId: "v1" }, { deviceIndex: 1, vehicleId: "v1" }] }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DeviceAssignmentMismatchError);
  });

  it("answers a bad time slot with its field error at the application stage", async () => {
    const error = (await useCaseAt("application").execute(body({ timeSlot: "evening" })).catch((e: unknown) => e)) as OnboardingValidationError;

    expect(error).toBeInstanceOf(OnboardingValidationError);
    expect(error.field).toBe("timeSlot");
  });

  it("still refuses a well formed body with the stage 409", async () => {
    const error = await useCaseAt("application").execute(body()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InstallationNotSchedulableError);
    expect((error as Error).message).toBe("An onboarding at the application stage cannot be scheduled");
  });
});
