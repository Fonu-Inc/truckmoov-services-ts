import { describe, expect, it } from "vitest";
import {
  countLiveStatuses,
  liveCountsEqual,
  liveStatusFor,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/live-status";
import {
  activeJobByVehicle,
  isActiveJob,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/active-jobs";
import type { DispatchJob } from "../../../apps/fleet/src/contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const NOW = Date.parse("2026-09-07T10:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60 * 1000).toISOString();
}

describe("Live vehicle status", () => {
  it("reads a moving vehicle with no job as active", () => {
    const status = liveStatusFor(
      { lastFixAt: minutesAgo(1), speedKph: 62, hasActiveJob: false },
      FIFTEEN_MINUTES,
      NOW,
    );
    expect(status).toBe("active");
  });

  it("reads a stationary vehicle with no job as idle", () => {
    const status = liveStatusFor(
      { lastFixAt: minutesAgo(1), speedKph: 0, hasActiveJob: false },
      FIFTEEN_MINUTES,
      NOW,
    );
    expect(status).toBe("idle");
  });

  // A truck waiting at a loading bay is still on the job.
  it("keeps a stationary vehicle on a job in progress", () => {
    const status = liveStatusFor(
      { lastFixAt: minutesAgo(1), speedKph: 0, hasActiveJob: true },
      FIFTEEN_MINUTES,
      NOW,
    );
    expect(status).toBe("in_progress");
  });

  // Offline wins over everything: the platform cannot say where the vehicle is,
  // so it cannot claim the job is progressing.
  it("reads a vehicle that has stopped reporting as offline even mid-job", () => {
    const status = liveStatusFor(
      { lastFixAt: minutesAgo(40), speedKph: 50, hasActiveJob: true },
      FIFTEEN_MINUTES,
      NOW,
    );
    expect(status).toBe("offline");
  });

  it("treats a missing or unreadable fix as offline, not idle", () => {
    expect(
      liveStatusFor({ lastFixAt: null, speedKph: 0, hasActiveJob: false }, FIFTEEN_MINUTES, NOW),
    ).toBe("offline");
    expect(
      liveStatusFor({ lastFixAt: "not-a-date", speedKph: 0, hasActiveJob: false }, FIFTEEN_MINUTES, NOW),
    ).toBe("offline");
  });

  // GPS noise on a parked vehicle reads as a few kph.
  it("does not call a parked vehicle active on GPS jitter", () => {
    expect(
      liveStatusFor({ lastFixAt: minutesAgo(1), speedKph: 3, hasActiveJob: false }, FIFTEEN_MINUTES, NOW),
    ).toBe("idle");
  });
});

describe("Status bar counts", () => {
  it("tallies the four buckets", () => {
    expect(countLiveStatuses(["active", "in_progress", "in_progress", "idle", "offline"])).toEqual({
      active: 1,
      in_progress: 2,
      idle: 1,
      offline: 1,
    });
  });

  it("compares tallies so an unchanged bar is not republished", () => {
    const counts = countLiveStatuses(["active", "idle"]);
    expect(liveCountsEqual(counts, countLiveStatuses(["idle", "active"]))).toBe(true);
    expect(liveCountsEqual(counts, countLiveStatuses(["active", "active"]))).toBe(false);
  });
});

describe("Active job per vehicle", () => {
  function job(overrides: Partial<DispatchJob> = {}): DispatchJob {
    return {
      id: "job-1",
      reference: "JOB-2481",
      status: "en-route",
      assignedVehicleId: "v1",
      assignedDriverId: "d1",
      amountNgn: 0,
      createdAt: "2026-09-07T08:00:00.000Z",
      updatedAt: "2026-09-07T08:00:00.000Z",
      pickupAddress: "Apapa Port",
      dropoffAddress: "Victoria Island",
      deadline: null,
      punctuality: null,
      ...overrides,
    };
  }

  it("counts the working states as active", () => {
    for (const status of ["assigned", "en-route", "arrived", "loaded"]) {
      expect(isActiveJob({ status })).toBe(true);
    }
  });

  // A job nobody has been assigned to is work waiting, not a vehicle on the
  // road, and delivered or cancelled is over.
  it("excludes created, delivered and cancelled", () => {
    for (const status of ["created", "delivered", "cancelled"]) {
      expect(isActiveJob({ status })).toBe(false);
    }
  });

  it("ignores a job with no vehicle", () => {
    expect(activeJobByVehicle([job({ assignedVehicleId: null })]).size).toBe(0);
  });

  // Dispatch does not guarantee one active job per vehicle. Picking whichever
  // came first would make the panel's job and ETA change between refreshes.
  it("keeps the most recently updated job when a vehicle has two", () => {
    const chosen = activeJobByVehicle([
      job({ id: "old", updatedAt: "2026-09-07T08:00:00.000Z" }),
      job({ id: "new", updatedAt: "2026-09-07T09:30:00.000Z" }),
    ]);
    expect(chosen.get("v1")?.id).toBe("new");
  });
});
