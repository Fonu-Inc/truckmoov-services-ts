import { describe, expect, it } from "vitest";
import { buildAnalyticsCsv } from "../../../apps/fleet/src/contexts/fleet/reports/domain/analytics-csv";

const input = {
  periodDays: 30,
  summary: { totalVehicles: 2 },
  fleetStatus: {
    total: 2,
    byStatus: { active: 1, inactive: 1 },
    breakdown: [
      { id: "v1", plateNumber: "LAG-1", status: "active", type: "van", assignedDriverId: null },
      { id: "v2", plateNumber: "LAG-2", status: "inactive", type: "truck", assignedDriverId: "d1" },
    ],
  },
  jobPipeline: {},
  fuelLevels: {
    periodDays: 30,
    vehicles: [{ vehicleId: "v1", plateNumber: "LAG-1", fuelLevelPercent: 60, lastUpdated: "2026-09-29" }],
  },
  driverScores: [],
};

describe("analytics CSV export", () => {
  it("writes lists of objects as sub-tables, never [object Object]", () => {
    const csv = buildAnalyticsCsv(input);

    expect(csv).not.toContain("[object Object]");
    expect(csv).toContain(
      [
        "breakdown",
        "id,plateNumber,status,type,assignedDriverId",
        "v1,LAG-1,active,van,",
        "v2,LAG-2,inactive,truck,d1",
      ].join("\n"),
    );
    expect(csv).toContain(
      [
        "vehicles",
        "vehicleId,plateNumber,fuelLevelPercent,lastUpdated",
        "v1,LAG-1,60,2026-09-29",
      ].join("\n"),
    );
  });

  it("keeps scalar fields beside the sub-table as key,value lines", () => {
    const csv = buildAnalyticsCsv(input);

    expect(csv).toContain("total,2");
    expect(csv).toContain("byStatus.active,1");
    expect(csv).toContain("periodDays,30");
  });

  it("marks an empty list as none", () => {
    const csv = buildAnalyticsCsv({ ...input, fuelLevels: { periodDays: 30, vehicles: [] } });

    expect(csv).toContain("vehicles\n(none)");
  });

  it("still neutralises formulas inside sub-table cells", () => {
    const csv = buildAnalyticsCsv({
      ...input,
      fuelLevels: { vehicles: [{ plateNumber: "=cmd()" }] },
    });

    expect(csv).toContain("'=cmd()");
  });
});
