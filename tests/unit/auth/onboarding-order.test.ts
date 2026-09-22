import { describe, expect, it } from "vitest";
import {
  buildOrderSummary,
  INSTALLATION_FEE_PER_DEVICE_NGN,
  toKobo,
} from "@auth/onboarding/domain/onboarding-order";
import type { StoredM2mLicensePlan } from "@auth/onboarding/domain/m2m-license-plan.repository";

const ADVANCE: StoredM2mLicensePlan = {
  id: "m2m-license-plan-m2m_advance",
  code: "m2m_advance",
  name: "M2M Advance License",
  description: "",
  perDeviceYear1Ngn: 124_000,
  perDeviceRenewalNgn: 80_000,
  sortOrder: 2,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Order summary", () => {
  it("reproduces the order on the payment screen", () => {
    const summary = buildOrderSummary(ADVANCE, 4);

    expect(summary.devicesNgn).toBe(496_000);
    expect(summary.installationNgn).toBe(60_000);
    expect(summary.totalNgn).toBe(556_000);
  });

  it("charges installation per device, not per application", () => {
    const one = buildOrderSummary(ADVANCE, 1);
    const ten = buildOrderSummary(ADVANCE, 10);

    expect(one.installationNgn).toBe(INSTALLATION_FEE_PER_DEVICE_NGN);
    expect(ten.installationNgn).toBe(INSTALLATION_FEE_PER_DEVICE_NGN * 10);
  });

  it("carries the renewal price so it is known before committing", () => {
    expect(buildOrderSummary(ADVANCE, 2).renewalPerDeviceNgn).toBe(80_000);
  });

  it("converts to kobo without floating point drift", () => {
    expect(toKobo(556_000)).toBe(55_600_000);
    expect(toKobo(0.1 + 0.2)).toBe(30);
  });
});
