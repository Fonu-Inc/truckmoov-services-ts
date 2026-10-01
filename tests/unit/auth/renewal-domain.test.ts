import { describe, expect, it } from "vitest";
import {
  BACKFILL_MIN_DAYS,
  billableDeviceCount,
  nextPeriodDates,
  priceRenewal,
  renewalDueDate,
  seedPeriodDates,
  withinLeadWindow,
} from "@auth/onboarding/domain/licence-renewal";

const seed = (paidAt: string, validityDays = 365) => ({
  tenantId: "t", applicationId: "a", planCode: "p", quantity: 3, validityDays, paidAt: new Date(paidAt),
});

describe("renewal pricing", () => {
  it("prices live renewal per device in kobo with tax on the subtotal", () => {
    const pricing = priceRenewal({ perDeviceRenewalNgn: 6_000 }, 5, 750);
    expect(pricing.unitPriceKobo).toBe(600_000);
    expect(pricing.totals).toMatchObject({ subtotalKobo: 3_000_000, taxKobo: 225_000, totalKobo: 3_225_000 });
  });

  it("charges zero tax when the tax rate is zero", () => {
    expect(priceRenewal({ perDeviceRenewalNgn: 6_000.5 }, 2, 0).totals).toMatchObject({
      subtotalKobo: 1_200_100, taxKobo: 0, totalKobo: 1_200_100,
    });
  });

  it("never bills fewer devices than were purchased", () => {
    expect(billableDeviceCount(5, 3)).toBe(5);
    expect(billableDeviceCount(5, 8)).toBe(8);
  });
});

describe("renewal dates", () => {
  it("opens the lead window exactly lead days before the end date", () => {
    expect(withinLeadWindow("2026-10-08", "2026-10-01", 7)).toBe(true);
    expect(withinLeadWindow("2026-10-09", "2026-10-01", 7)).toBe(false);
    expect(withinLeadWindow("2026-09-01", "2026-10-01", 7)).toBe(true);
  });

  it("is due on the expiry date and never in the past", () => {
    expect(renewalDueDate("2026-10-08", "2026-10-01")).toBe("2026-10-08");
    expect(renewalDueDate("2026-09-20", "2026-10-01")).toBe("2026-10-01");
  });

  it("seeds a purchase period from the Lagos date of payment", () => {
    expect(seedPeriodDates(seed("2026-09-20T23:30:00Z"), "2026-10-01")).toEqual({
      periodStart: "2026-09-21", periodEnd: "2027-09-21", origin: "purchase",
    });
  });

  it("gives backfilled customers at least thirty days", () => {
    const dates = seedPeriodDates(seed("2025-10-01T10:00:00Z"), "2026-10-01");
    expect(dates).toMatchObject({ periodEnd: "2026-10-31", origin: "backfill" });
    expect(BACKFILL_MIN_DAYS).toBe(30);
  });

  it("extends from the old end date when paid early or on time", () => {
    expect(nextPeriodDates("2026-10-08", 365, "2026-10-01")).toEqual({
      periodStart: "2026-10-09", periodEnd: "2027-10-08",
    });
    expect(nextPeriodDates("2026-10-08", 365, "2026-10-08").periodEnd).toBe("2027-10-08");
  });

  it("extends from the old end date when paid inside grace", () => {
    expect(nextPeriodDates("2026-10-08", 365, "2026-10-11").periodEnd).toBe("2027-10-08");
  });

  it("restarts from today when paid after the new end would already have passed", () => {
    expect(nextPeriodDates("2024-01-01", 365, "2026-10-01")).toEqual({
      periodStart: "2026-10-01", periodEnd: "2027-10-01",
    });
  });
});
