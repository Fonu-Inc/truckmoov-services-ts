import { beforeEach, describe, expect, it } from "vitest";
import {
  harshTypesFromAlarm,
  inWindow,
  normaliseRuleInput,
  ViolationRuleInputError,
} from "../../../apps/fleet/src/violations.domain";
import { InMemoryViolationsRepository } from "../../../apps/fleet/src/violations.repository";
import { ViolationsService } from "../../../apps/fleet/src/violations.service";

// 23 November 2026 is a Monday; Lagos is UTC+1.
const lagos = (iso: string) => new Date(`${iso}+01:00`);

describe("Violation rule input", () => {
  it("needs a scope that matches the page the rule sits on", () => {
    expect(() => normaliseRuleInput({ entity: "drivers", name: "Speed", type: "overspeeding", trigger: { speedKph: 100 }, scope: "all_vehicles", severity: "high" }))
      .toThrow(ViolationRuleInputError);
  });

  it("needs a speed for an overspeeding rule and ids for a selected scope", () => {
    expect(() => normaliseRuleInput({ entity: "vehicles", name: "Speed", type: "overspeeding", scope: "all_vehicles", severity: "high" })).toThrow(ViolationRuleInputError);
    expect(() => normaliseRuleInput({ entity: "vehicles", name: "Speed", type: "overspeeding", trigger: { speedKph: 100 }, scope: "selected_vehicles", severity: "high" }))
      .toThrow(ViolationRuleInputError);
  });

  it("keeps only the trigger fields for the rule's type", () => {
    const rule = normaliseRuleInput({ entity: "drivers", name: "Night", type: "restricted_hours", trigger: { restrictedStart: "23:00", restrictedEnd: "05:00", speedKph: 9 }, scope: "all_drivers", severity: "medium" });
    expect(rule.trigger).toEqual({ restrictedStart: "23:00", restrictedEnd: "05:00", restrictedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] });
  });
});

describe("Time windows (Lagos)", () => {
  it("runs an overnight window past midnight into the next day", () => {
    expect(inWindow(lagos("2026-11-23T23:30:00"), "23:00", "05:00", ["Mon"])).toBe(true);
    expect(inWindow(lagos("2026-11-24T02:00:00"), "23:00", "05:00", ["Mon"])).toBe(true);
    expect(inWindow(lagos("2026-11-24T06:00:00"), "23:00", "05:00", ["Mon"])).toBe(false);
    expect(inWindow(lagos("2026-11-24T23:30:00"), "23:00", "05:00", ["Mon"])).toBe(false);
  });
});

describe("Device alarms", () => {
  it("maps harsh-driving alarms and ignores the rest", () => {
    expect(harshTypesFromAlarm("hardBraking,sos")).toEqual(["harsh_braking"]);
    expect(harshTypesFromAlarm("hardCornering")).toEqual(["harsh_cornering"]);
    expect(harshTypesFromAlarm("powerCut")).toEqual([]);
    expect(harshTypesFromAlarm(undefined)).toEqual([]);
  });
});

describe("Violation engine", () => {
  let repo: InMemoryViolationsRepository;
  let service: ViolationsService;
  let published: unknown[];
  let behaviour: unknown[];

  beforeEach(() => {
    repo = new InMemoryViolationsRepository();
    published = [];
    behaviour = [];
    const vehicles = { findById: async (id: string) => ({ id, assignedDriverId: id === "v1" ? "d1" : null }) } as never;
    const behavior = { recordEvent: async (_t: string, e: unknown) => (behaviour.push(e), { id: `e${behaviour.length}`, occurredAt: new Date().toISOString() }) } as never;
    const bus = { publish: async (_s: string, e: unknown) => void published.push(e) } as never;
    service = new ViolationsService(repo, vehicles, behavior, bus);
  });

  const fix = (iso: string, speedKph: number | null, alarm?: string) =>
    service.onFix({ tenantId: "t1", vehicleId: "v1", speedKph, latitude: 6.5, longitude: 3.4, at: lagos(iso), alarm });

  it("raises one overspeeding violation per unbroken run past the minimum duration", async () => {
    await service.createRule("t1", { entity: "vehicles", name: "Speed", type: "overspeeding", trigger: { speedKph: 100, minDurationSeconds: 30 }, scope: "all_vehicles", severity: "high" });

    await fix("2026-11-23T10:00:00", 120);
    expect(repo.violations).toHaveLength(0);
    await fix("2026-11-23T10:00:40", 125);
    await fix("2026-11-23T10:00:50", 130);
    expect(repo.violations).toHaveLength(1);
    expect(repo.violations[0]).toMatchObject({ vehicleId: "v1", driverId: "d1", recordedValue: "125 km/h", threshold: "100 km/h" });

    await fix("2026-11-23T10:01:00", 80);
    await fix("2026-11-23T10:05:00", 120);
    await fix("2026-11-23T10:05:31", 120);
    expect(repo.violations).toHaveLength(2);
    expect(published).toHaveLength(2);
  });

  it("raises restricted-hours driving once per vehicle per day, and not while parked", async () => {
    await service.createRule("t1", { entity: "drivers", name: "Night", type: "restricted_hours", trigger: { restrictedStart: "22:00", restrictedEnd: "05:00" }, scope: "all_drivers", severity: "medium", notify: false });

    await fix("2026-11-23T21:00:00", 40);
    await fix("2026-11-23T22:30:00", 0);
    expect(repo.violations).toHaveLength(0);
    await fix("2026-11-23T22:31:00", 40);
    await fix("2026-11-23T22:45:00", 50);
    expect(repo.violations).toHaveLength(1);
    expect(published).toHaveLength(0);
  });

  it("turns a tracker's harsh-braking alarm into a behaviour event and a violation", async () => {
    await service.createRule("t1", { entity: "drivers", name: "Braking", type: "harsh_braking", scope: "all_drivers", severity: "critical" });

    await fix("2026-11-23T10:00:00", 60, "hardBraking");

    expect(behaviour).toMatchObject([{ driverId: "d1", vehicleId: "v1", type: "harsh_braking" }]);
    expect(repo.violations).toMatchObject([{ type: "harsh_braking", driverId: "d1", severity: "critical", recordedValue: "Reported by device" }]);
  });

  it("ignores paused rules and rules outside their schedule", async () => {
    await service.createRule("t1", { entity: "vehicles", name: "Off", type: "overspeeding", trigger: { speedKph: 100 }, scope: "all_vehicles", severity: "low", status: "inactive" });
    await service.createRule("t1", { entity: "vehicles", name: "Day only", type: "overspeeding", trigger: { speedKph: 100 }, scope: "all_vehicles", severity: "low", schedule: { mode: "scheduled", days: ["Mon"], start: "06:00", end: "18:00" } });

    await fix("2026-11-23T20:00:00", 150);
    expect(repo.violations).toHaveLength(0);
    await fix("2026-11-23T12:00:00", 150);
    expect(repo.violations.map((v) => v.ruleName)).toEqual(["Day only"]);
  });

  it("counts quota use and repeat offenders per driver", async () => {
    await service.createRule("t1", { entity: "drivers", name: "Braking", type: "harsh_braking", scope: "all_drivers", severity: "high", quota: 2, quotaPeriod: "monthly", repeatThreshold: 3 });
    const now = lagos("2026-11-23T12:00:00");
    for (let i = 0; i < 3; i += 1) {
      await service.onHarshEvent({ tenantId: "t1", type: "harsh_braking", vehicleId: "v1", driverId: "d1", latitude: null, longitude: null, at: lagos(`2026-11-2${i}T08:00:00`), sourceKey: `e${i}` });
    }

    const summary = await service.summary("t1", "drivers", 30, null, now);

    expect(summary).toMatchObject({ total: 3, subjectsWithViolations: 1, repeatOffenders: 1 });
    expect(summary.subjects[0]).toMatchObject({ subjectId: "d1", quota: { used: 3, quota: 2, exceeded: true }, repeatOffender: true });
  });
});
