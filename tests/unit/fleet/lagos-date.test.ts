import { describe, expect, it } from "vitest";
import { lagosToday } from "../../../apps/fleet/src/utils/lagos-date";

describe("lagosToday", () => {
  it("has already turned the day at 23:30 UTC", () => {
    expect(lagosToday(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
  });
});
