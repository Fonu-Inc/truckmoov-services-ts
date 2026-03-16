import { describe, expect, it, vi } from "vitest";
import { ProcessCpaasReplyUseCase } from "../../../apps/fleet/src/contexts/fleet/integrations/application/process-cpaas-reply.use-case";
import { InMemoryDriverRepository } from "../../../apps/fleet/src/contexts/fleet/drivers/infrastructure/repositories/in-memory-driver.repository";
import { InMemoryJobRepository } from "../../../apps/fleet/src/contexts/fleet/jobs/infrastructure/in-memory-job.repository";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";
import { Job } from "../../../apps/fleet/src/contexts/fleet/jobs/domain/entities/job.entity";

function makeDriver(phone = "+2348000000001", vehicleId: string | null = "v1") {
  return Driver.create({ id: "d1", name: "Test Driver", licenseNumber: "NG-001", tenantId: "t1", status: "active", assignedVehicleId: vehicleId, contactChannels: { whatsappNumber: phone, smsNumber: null, voiceNumber: null } });
}

function makeJob(vehicleId = "v1", status = "assigned") {
  return Job.create({ jobId: "job-1", tenantId: "t1", status, updatedAt: new Date().toISOString(), assignedVehicleId: vehicleId });
}

function build() {
  const driverRepo = new InMemoryDriverRepository();
  const jobRepo = new InMemoryJobRepository();
  const bus = { publish: vi.fn().mockResolvedValue(undefined) };
  return { uc: new ProcessCpaasReplyUseCase(driverRepo, jobRepo, bus as any), driverRepo, jobRepo, bus };
}

describe("ProcessCpaasReplyUseCase", () => {
  it("publishes job.status.changed on ACCEPT", async () => {
    const { uc, driverRepo, jobRepo, bus } = build();
    await driverRepo.save(makeDriver());
    await jobRepo.save(makeJob());
    await uc.execute("t1", "+2348000000001", "ACCEPT");
    expect(bus.publish).toHaveBeenCalledWith("tm.t1.job.status.changed", expect.objectContaining({ data: expect.objectContaining({ new_status: "assigned" }) }));
  });

  it("publishes pending status on REJECT", async () => {
    const { uc, driverRepo, jobRepo, bus } = build();
    await driverRepo.save(makeDriver());
    await jobRepo.save(makeJob());
    await uc.execute("t1", "+2348000000001", "REJECT");
    expect(bus.publish).toHaveBeenCalledWith("tm.t1.job.status.changed", expect.objectContaining({ data: expect.objectContaining({ new_status: "pending" }) }));
  });

  it("sends STATUS ack without publishing job event", async () => {
    const { uc, bus } = build();
    await uc.execute("t1", "+2348000000001", "STATUS");
    expect(bus.publish.mock.calls.filter((c: any) => c[0].includes("job.status"))).toHaveLength(0);
    expect(bus.publish.mock.calls.filter((c: any) => c[0].includes("notification.send"))).toHaveLength(1);
  });

  it("ignores unknown keyword", async () => {
    const { uc, bus } = build();
    await uc.execute("t1", "+2348000000001", "HELLO");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("does nothing when driver not found", async () => {
    const { uc, bus } = build();
    await uc.execute("t1", "+9999999999", "ACCEPT");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("does nothing when no active job found", async () => {
    const { uc, driverRepo, jobRepo, bus } = build();
    await driverRepo.save(makeDriver());
    await jobRepo.save(makeJob("v1", "delivered"));
    await uc.execute("t1", "+2348000000001", "ACCEPT");
    expect(bus.publish.mock.calls.filter((c: any) => c[0].includes("job.status"))).toHaveLength(0);
  });

  it("maps DONE keyword to delivered", async () => {
    const { uc, driverRepo, jobRepo, bus } = build();
    await driverRepo.save(makeDriver());
    await jobRepo.save(makeJob());
    await uc.execute("t1", "+2348000000001", "DONE");
    expect(bus.publish).toHaveBeenCalledWith("tm.t1.job.status.changed", expect.objectContaining({ data: expect.objectContaining({ new_status: "delivered" }) }));
  });
});
