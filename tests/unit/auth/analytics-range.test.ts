import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { analyticsRangeProblem } from "../../../apps/auth/src/analytics-range";
import { assertAnalyticsRange } from "../../../apps/auth/src/analytics-range.validation";

describe("custom analytics range", () => {
  // These used to reach new Date() and come back as a 500.
  it.each([
    [{ range: "custom" as const }, "startDate"],
    [{ range: "custom" as const, startDate: "nope", endDate: "nope" }, "startDate"],
    [{ range: "custom" as const, startDate: "2026-09-11", endDate: "nope" }, "endDate"],
    [{ range: "custom" as const, startDate: "2026-10-05", endDate: "2026-10-01" }, "endDate"],
  ])("refuses %o under %s", (query, field) => {
    expect(analyticsRangeProblem(query)?.field).toBe(field);
    expect(() => assertAnalyticsRange(query)).toThrow(BadRequestException);
  });

  it("accepts a valid custom range, an open-ended one, and the preset ranges", () => {
    expect(analyticsRangeProblem({ range: "custom", startDate: "2026-09-11", endDate: "2026-10-01" })).toBeNull();
    expect(analyticsRangeProblem({ range: "custom", startDate: "2026-09-11" })).toBeNull();
    expect(analyticsRangeProblem({ range: "30d" })).toBeNull();
    expect(analyticsRangeProblem({})).toBeNull();
  });
});
