import { describe, expect, it } from "vitest";
import { usageDeltas } from "../../../apps/auth/src/get-system-sim-data-usage.use-case";
import { cumulativeTenants } from "../../../apps/auth/src/get-system-tenant-growth.use-case";
import { lagosDayKey, lagosDayWindow } from "../../../apps/auth/src/sim-usage.repository";

describe("sim usage deltas", () => {
  it("uses growth between consecutive days and zero when a side is missing", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"];
    const snapshots = new Map([
      ["2026-09-30", 100],
      ["2026-10-01", 130],
      ["2026-10-02", 130],
      ["2026-10-03", 90],
      ["2026-10-05", 500],
    ]);

    expect(usageDeltas(days, snapshots).map((d) => d.usageMb)).toEqual([30, 0, 0, 0]);
  });

  it("is zero for the first snapshot ever", () => {
    expect(usageDeltas(["2026-10-02"], new Map([["2026-10-02", 400]]))[0].usageMb).toBe(0);
  });

  it("builds the Lagos day window ending today", () => {
    const now = new Date("2026-10-01T23:30:00Z");
    expect(lagosDayKey(now)).toBe("2026-10-02");
    expect(lagosDayWindow(now, 3)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});

describe("tenant growth", () => {
  it("accumulates from tenants created before the window and zero-fills", () => {
    const created = new Map([
      ["2026-06", 2],
      ["2026-08", 1],
      ["2026-10", 3],
    ]);

    expect(cumulativeTenants(["2026-08", "2026-09", "2026-10"], created)).toEqual([
      { month: "2026-08", tenants: 3 },
      { month: "2026-09", tenants: 3 },
      { month: "2026-10", tenants: 6 },
    ]);
  });
});
