import { describe, expect, it, vi } from "vitest";
import { LiveTrackingCountsService } from "../../../apps/fleet/src/live-tracking-counts.service";

const job = (vehicleId: string, status: string) => ({
  id: `job-${vehicleId}`,
  reference: "J1",
  status,
  assignedVehicleId: vehicleId,
  assignedDriverId: null,
  amountNgn: 0,
  createdAt: "2026-02-02T10:00:00Z",
  updatedAt: "2026-02-02T10:00:00Z",
  pickupAddress: null,
  dropoffAddress: null,
  deadline: null,
  punctuality: null,
});

function build(jobs: unknown[] | Error, registered: string[] = [], latest: unknown[] | Error = [], owners: Record<string, string> = {}) {
  const published: Array<Record<string, number>> = [];
  const ownerCounts: Array<{ subject: string; data: unknown }> = [];
  const bus = {
    publish: vi.fn(async (subject: string, envelope: { data: Record<string, number> }) => {
      if (subject.endsWith(".tracking.owner_counts")) ownerCounts.push({ subject, data: envelope.data });
      else published.push(envelope.data);
    }),
  };
  const config = { liveTracking: { sweepIntervalSeconds: 60, offlineAfterMinutes: 15 } };
  const dispatch = { listJobs: vi.fn(async () => { if (jobs instanceof Error) throw jobs; return jobs; }) };
  const vehicleList = {
    listIdsAndOwnersByTenant: vi.fn(async () => registered.map((id) => ({ id, ownerOperatorId: owners[id] ?? null }))),
  };
  const positions = { listLatestPositions: vi.fn(async () => { if (latest instanceof Error) throw latest; return latest; }) };
  const service = new LiveTrackingCountsService(bus as never, config as never, dispatch as never, vehicleList as never, positions as never);
  return { service, published, ownerCounts, dispatch, vehicleList, positions };
}

const fix = (vehicleId: string) => ({ tenantId: "t1", vehicleId, fixedAt: new Date().toISOString(), speedKph: 0 });

describe("LiveTrackingCountsService in-progress count", () => {
  it("counts vehicles on a real dispatch job as in progress", async () => {
    const { service, published } = build([job("v1", "en-route"), job("v2", "delivered")]);
    service.record(fix("v1"));
    service.record(fix("v2"));
    await vi.waitFor(() => expect(service.countsFor("t1").in_progress).toBe(1));
    expect(service.countsFor("t1")).toEqual({ active: 0, in_progress: 1, idle: 1, offline: 0 });
    expect(published.at(-1)?.in_progress).toBe(1);
  });

  it("counts registered vehicles that never reported as offline", async () => {
    const { service } = build([], ["v1", "v2", "v3"]);
    service.record(fix("v1"));
    await vi.waitFor(() => expect(service.countsFor("t1").offline).toBe(2));
    expect(service.countsFor("t1")).toEqual({ active: 0, in_progress: 0, idle: 1, offline: 2 });
  });

  it("seeds unseen vehicles from their latest stored position instead of offline", async () => {
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const latest = [
      { vehicleId: "v1", latitude: 1, longitude: 2, speedKph: 40, recordedAt: recent },
      { vehicleId: "v2", latitude: 1, longitude: 2, speedKph: 0, recordedAt: stale },
      { vehicleId: "v3", latitude: 1, longitude: 2, speedKph: 0, recordedAt: "not-a-date" },
    ];
    const { service } = build([], ["v1", "v2", "v3", "v4"], latest);
    service.record(fix("v9"));
    await vi.waitFor(() => expect(service.countsFor("t1").offline).toBe(3));
    expect(service.countsFor("t1")).toEqual({ active: 1, in_progress: 0, idle: 1, offline: 3 });
  });

  it("retries seeding next cycle when positions are unreachable instead of seeding offline", async () => {
    const { service, positions } = build([], ["v1", "v2"], new Error("tracking down"));
    service.record(fix("v1"));
    await vi.waitFor(() => expect(positions.listLatestPositions).toHaveBeenCalled());
    expect(service.countsFor("t1")).toEqual({ active: 0, in_progress: 0, idle: 1, offline: 0 });
  });

  it("keeps counting without jobs when dispatch is unreachable", async () => {
    const { service, dispatch } = build(new Error("dispatch down"));
    service.record(fix("v1"));
    await vi.waitFor(() => expect(dispatch.listJobs).toHaveBeenCalled());
    expect(service.countsFor("t1")).toEqual({ active: 0, in_progress: 0, idle: 1, offline: 0 });
  });

  it("asks dispatch at most once per refresh window", async () => {
    const { service, dispatch } = build([]);
    service.record(fix("v1"));
    service.record(fix("v2"));
    service.record(fix("v1"));
    await vi.waitFor(() => expect(dispatch.listJobs).toHaveBeenCalledTimes(1));
    expect(dispatch.listJobs).toHaveBeenCalledTimes(1);
  });
});

describe("LiveTrackingCountsService per-owner counts", () => {
  it("publishes an owner operator's own counts apart from the tenant's", async () => {
    const { service, ownerCounts } = build([], ["v1", "v2"], [], { v1: "op-1" });
    service.record(fix("v1"));
    await vi.waitFor(() => expect(ownerCounts.length).toBeGreaterThan(0));
    service.record(fix("v2"));

    const last = ownerCounts.at(-1)!;
    expect(last.subject).toBe("tm.t1.tracking.owner_counts");
    expect(last.data).toEqual({ owner_operator_id: "op-1", counts: { active: 0, in_progress: 0, idle: 1, offline: 0 } });
  });
});
