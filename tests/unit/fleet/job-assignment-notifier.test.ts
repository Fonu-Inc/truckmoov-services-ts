import { describe, expect, it, vi } from "vitest";
import { JobAssignmentNotifier } from "../../../apps/fleet/src/job-assignment-notifier";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";

function makeDriver(phone: string | null = "+2348000000001") {
  return Driver.create({
    id: "d1",
    name: "Test Driver",
    licenseNumber: "NG-001",
    tenantId: "t1",
    status: "active",
    assignedVehicleId: null,
    contactChannels: { whatsappNumber: phone, smsNumber: null, voiceNumber: null },
  });
}

function buildNotifier(driver: ReturnType<typeof makeDriver> | null) {
  const unsubFn = vi.fn().mockResolvedValue(undefined);
  let capturedHandler: ((event: any) => Promise<void>) | null = null;
  const bus = {
    subscribe: vi.fn().mockImplementation((_subject: string, handler: (event: any) => Promise<void>) => {
      capturedHandler = handler;
      return Promise.resolve(unsubFn);
    }),
    publish: vi.fn().mockResolvedValue(undefined),
  };
  const driverRepo = { findById: vi.fn().mockResolvedValue(driver) };
  const notifier = new JobAssignmentNotifier(bus as any, driverRepo as any);
  return { notifier, bus, driverRepo, capturedHandler: () => capturedHandler, unsubFn };
}

function makeEvent(driverId: string, jobId: string, newStatus: string, tenantId = "t1") {
  return { tenant_id: tenantId, data: { new_status: newStatus, driver_id: driverId, job_id: jobId } };
}

describe("JobAssignmentNotifier", () => {
  it("subscribes on bootstrap", async () => {
    const { notifier, bus } = buildNotifier(makeDriver());
    await notifier.onApplicationBootstrap();
    expect(bus.subscribe).toHaveBeenCalledWith("tm.*.job.status.changed", expect.any(Function));
  });

  it("publishes notification.send when status is assigned and driver has whatsapp", async () => {
    const { notifier, bus, capturedHandler } = buildNotifier(makeDriver());
    await notifier.onApplicationBootstrap();
    await capturedHandler()!(makeEvent("d1", "job-1", "assigned"));
    expect(bus.publish).toHaveBeenCalledWith(
      "tm.t1.notification.send",
      expect.objectContaining({ data: expect.objectContaining({ channel: "whatsapp", recipient: "+2348000000001" }) }),
    );
  });

  it("does not publish when new_status is not assigned", async () => {
    const { notifier, bus, capturedHandler } = buildNotifier(makeDriver());
    await notifier.onApplicationBootstrap();
    await capturedHandler()!(makeEvent("d1", "job-1", "delivered"));
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("does not publish when driver has no whatsapp number", async () => {
    const { notifier, bus, capturedHandler } = buildNotifier(makeDriver(null));
    await notifier.onApplicationBootstrap();
    await capturedHandler()!(makeEvent("d1", "job-1", "assigned"));
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("does not publish when driver not found", async () => {
    const { notifier, bus, capturedHandler } = buildNotifier(null);
    await notifier.onApplicationBootstrap();
    await capturedHandler()!(makeEvent("d1", "job-1", "assigned"));
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("calls unsub on shutdown", async () => {
    const { notifier, unsubFn } = buildNotifier(makeDriver());
    await notifier.onApplicationBootstrap();
    await notifier.onApplicationShutdown();
    expect(unsubFn).toHaveBeenCalled();
  });
});
