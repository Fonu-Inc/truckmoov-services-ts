import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OnboardingApplicationDto } from "../../../apps/auth/src/dto/onboarding-application.dto";
import {
  OnboardingDeviceRequestDto,
  OnboardingVehicleDto,
} from "../../../apps/auth/src/dto/onboarding-vehicle.dto";
import { ScheduleInstallationDto } from "../../../apps/auth/src/dto/schedule-installation.dto";

// Same options as apps/auth/src/main.ts.
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function bind(metatype: new () => object, value: object) {
  return pipe.transform(value, { type: "body", metatype });
}

const cases: Array<[string, new () => object, Record<string, unknown>]> = [
  [
    "OnboardingApplicationDto",
    OnboardingApplicationDto,
    {
      applicantType: "enterprise",
      organizationName: "Arne logistics Ltd",
      businessEmail: "jane@arne.com",
      organizationPhone: "+234 80 0000 0000",
      contactFullName: "Jane Doe",
      contactRole: "Fleet Manager",
      m2mPlanCode: "m2m_standard",
      streetAddress: "Mazi Fedelis Street",
      city: "Abuja",
      state: "FCT",
      rcNumber: "RC1234567",
      taxIdentificationNumber: "12345678-0001",
      identificationType: "nin",
      identificationNumber: "12345678901",
    },
  ],
  [
    "OnboardingVehicleDto",
    OnboardingVehicleDto,
    {
      registrationNumber: "LAG-123-ABC",
      vehicleType: "truck",
      make: "Toyota",
      model: "Hilux",
      year: 2021,
      engineNumber: "ENG-000123",
      chassisNumber: "JTEBU5JR9",
      color: "White",
      engineCapacity: "2.8L",
      odometerReading: 84500,
      purchaseType: "other",
      purchaseTypeOther: "Donated",
    },
  ],
  [
    "OnboardingDeviceRequestDto",
    OnboardingDeviceRequestDto,
    { quantity: 2, useCase: "Tracking the Lagos fleet", notes: "Soon" },
  ],
  [
    "ScheduleInstallationDto",
    ScheduleInstallationDto,
    {
      scheduledDate: "2026-10-05",
      timeSlot: "morning",
      addressLine: "12 Mazi Fedelis Street",
      city: "Lagos",
      state: "Lagos",
      siteContactName: "Victor Akaaha",
      siteContactPhone: "+234 704 138 6799",
      notes: "Gate 2",
      assignments: [{ deviceIndex: 1, vehicleId: "veh-1" }],
    },
  ],
];

describe("Onboarding DTOs under the global ValidationPipe", () => {
  it.each(cases)("%s passes every documented field through", async (_name, metatype, payload) => {
    const bound = await bind(metatype, payload);

    expect({ ...bound }).toEqual(payload);
  });

  it.each(cases)("%s still rejects an undocumented field", async (_name, metatype, payload) => {
    await expect(bind(metatype, { ...payload, injected: "x" })).rejects.toThrow();
  });
});
