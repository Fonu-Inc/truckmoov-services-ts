import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PERIOD_DAYS,
  parseAnalyticsPeriodDays,
} from "../../../apps/fleet/src/contexts/fleet/reports/domain/analytics-period";

describe("analytics period_days", () => {
  it("accepts every window the screen offers", () => {
    for (const days of ANALYTICS_PERIOD_DAYS) {
      expect(parseAnalyticsPeriodDays(String(days))).toBe(days);
    }
  });

  it("defaults to 30 when absent", () => {
    expect(parseAnalyticsPeriodDays(undefined)).toBe(30);
    expect(parseAnalyticsPeriodDays("")).toBe(30);
  });

  // 42 used to be echoed straight back, so a chart claimed a window nobody
  // had aggregated over.
  it("rejects anything else rather than echoing it back", () => {
    for (const raw of ["42", "0", "-7", "abc", "7.5"]) {
      expect(() => parseAnalyticsPeriodDays(raw)).toThrow(/period_days must be one of/);
    }
  });
});
