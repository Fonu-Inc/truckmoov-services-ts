import { describe, expect, it, vi } from "vitest";
import { signBusEvent } from "@shared/eventbus";
import { ShareLinkLifecycleService } from "../../../apps/fleet/src/share-link-lifecycle.service";
import { DriverPerformanceListener } from "../../../apps/fleet/src/driver-performance.listener";
import { InMemoryShareLinkRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-share-link.repository";

type Handler = (event: unknown, meta?: { subject: string }) => Promise<void>;

const SECRET = "bus-secret";
const config = { eventSigningSecret: SECRET, eventAcceptUnsigned: false } as never;
const SUBJECT = "tm.tenant-a.job.status.changed";

function captureBus() {
  const subscriptions: Array<{ subject: string; handler: Handler; consumer?: string }> = [];
  const bus = {
    subscribe: vi.fn(async (subject: string, handler: Handler, consumer?: string) => {
      subscriptions.push({ subject, handler, consumer });
      return async () => {};
    }),
    publish: vi.fn(async () => {}),
  };
  return { bus, subscriptions };
}

// Exactly what Go dispatch publishes: snake_case data, tenant on the envelope.
function delivered(jobId: string, driverId: string) {
  return signBusEvent(SECRET, SUBJECT, {
    id: "evt-1",
    type: "job.status.changed",
    version: 1,
    occurred_at: new Date().toISOString(),
    tenant_id: "tenant-a",
    data: { job_id: jobId, previous_status: "en_route", new_status: "delivered", assigned_driver_id: driverId },
  });
}

describe("job.status.changed consumers", () => {
  it("revokes the share link when dispatch reports the job delivered", async () => {
    const { bus, subscriptions } = captureBus();
    const links = new InMemoryShareLinkRepository();
    await links.save({
      id: "l1",
      tenantId: "tenant-a",
      vehicleId: "v1",
      jobId: "job-1",
      tokenHash: "hash-l1",
      createdBy: "user-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
    });
    const service = new ShareLinkLifecycleService(bus as never, links, config);
    await service.onApplicationBootstrap();
    service.onApplicationShutdown();

    await subscriptions[0].handler(delivered("job-1", "d1"), { subject: SUBJECT });

    expect(await links.findActiveForVehicle("tenant-a", "v1")).toBeNull();
  });

  it("does not revoke another tenant's link for a job with the same id", async () => {
    const { bus, subscriptions } = captureBus();
    const links = new InMemoryShareLinkRepository();
    await links.save({
      id: "l1",
      tenantId: "tenant-b",
      vehicleId: "v1",
      jobId: "job-1",
      tokenHash: "hash-l1",
      createdBy: "user-1",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
    });
    const service = new ShareLinkLifecycleService(bus as never, links, config);
    await service.onApplicationBootstrap();
    service.onApplicationShutdown();

    await subscriptions[0].handler(delivered("job-1", "d1"), { subject: SUBJECT });

    expect(await links.findActiveForVehicle("tenant-b", "v1")).not.toBeNull();
  });

  it("recalculates the driver's score on its own durable when dispatch reports delivery", async () => {
    const { bus, subscriptions } = captureBus();
    const driver = { withPerformance: vi.fn(() => driver) };
    const driverRepo = { findById: vi.fn(async () => driver), save: vi.fn(async () => {}) };
    const punctuality = {
      deadline: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      trafficAllowanceSeconds: 0,
      latenessSeconds: 0,
      onTime: true,
    };
    const dispatchJobs = { listJobs: vi.fn(async () => [{ assignedDriverId: "d1", punctuality }]) };
    new DriverPerformanceListener(bus as never, dispatchJobs as never, driverRepo as never, config).onModuleInit();

    expect(subscriptions[0].consumer).toBe("driver_performance");
    await subscriptions[0].handler(delivered("job-1", "d1"), { subject: SUBJECT });

    expect(driverRepo.findById).toHaveBeenCalledWith("d1", "tenant-a");
    expect(driverRepo.save).toHaveBeenCalledTimes(1);
  });
});
