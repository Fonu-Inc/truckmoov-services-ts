import { describe, expect, it } from "vitest";
import { DeviceSetupRequest } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/domain/entities/device-setup-request.entity";
import { InMemoryDeviceSetupRequestRepository } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/infrastructure/repositories/in-memory-device-setup-request.repository";
import { CreateDeviceSetupRequestUseCase } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/application/use-cases/create-device-setup-request.use-case";
import { ListDeviceSetupRequestsUseCase } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/application/use-cases/list-device-setup-requests.use-case";
import { UpdateDeviceSetupRequestStatusUseCase } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/application/use-cases/update-device-setup-request-status.use-case";
import { GetDeviceSetupRequestUseCase } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/application/use-cases/get-device-setup-request.use-case";

let counter = 0;
const runtime = {
  generateId: () => `req-${++counter}`,
  getDefaultTenantId: () => "t1",
} as unknown as never;

function baseInput() {
  return { id: "r1", tenantId: "t1", manufacturer: "Teltonika", trackerType: "hardwired" as const, useCase: "Long-haul GPS tracking" };
}

describe("DeviceSetupRequest entity", () => {
  it("creates with pending_review status and a seeded timeline", () => {
    const req = DeviceSetupRequest.create(baseInput());
    const p = req.toPrimitives();
    expect(p.status).toBe("pending_review");
    expect(p.quantity).toBe(1);
    expect(p.simRequired).toBe(false);
    expect(p.timeline).toHaveLength(1);
    expect(p.timeline[0].status).toBe("pending_review");
  });

  it("requires a carrier when a SIM is requested", () => {
    expect(() => DeviceSetupRequest.create({ ...baseInput(), simRequired: true })).toThrow(/carrierId/);
  });

  it("rejects an invalid tracker type", () => {
    expect(() => DeviceSetupRequest.create({ ...baseInput(), trackerType: "rocket" as never })).toThrow(/trackerType/);
  });

  it("follows the provisioning lifecycle and appends timeline entries", () => {
    const req = DeviceSetupRequest.create(baseInput())
      .decide("approved", "admin-1")
      .transitionTo("in_progress")
      .transitionTo("provisioned")
      .transitionTo("assigned");

    expect(req.status).toBe("assigned");
    expect(req.toPrimitives().timeline.map((t) => t.status)).toEqual([
      "pending_review",
      "approved",
      "in_progress",
      "provisioned",
      "assigned",
    ]);
  });

  // Provisioning cannot start on a request the platform has not accepted.
  it("cannot start work before the platform has approved the request", () => {
    expect(() => DeviceSetupRequest.create(baseInput()).transitionTo("in_progress")).toThrow(
      /invalid setup-request transition/,
    );
  });

  it("rejects an illegal transition", () => {
    const req = DeviceSetupRequest.create(baseInput());
    expect(() => req.transitionTo("assigned")).toThrow(/invalid setup-request transition/);
  });

  it("records who decided, and refuses a rejection with no reason", () => {
    const rejected = DeviceSetupRequest.create(baseInput()).decide("rejected", "admin-1", "Model deprecated");
    expect(rejected.toPrimitives()).toMatchObject({
      status: "rejected",
      decidedBy: "admin-1",
      decisionReason: "Model deprecated",
    });

    expect(() => DeviceSetupRequest.create(baseInput()).decide("rejected", "admin-1")).toThrow(/reason/);
  });

  // A rejected request is not retried in place; the tenant submits a new one.
  it("treats a rejection as final", () => {
    const rejected = DeviceSetupRequest.create(baseInput()).decide("rejected", "admin-1", "No stock");
    expect(() => rejected.transitionTo("in_progress")).toThrow(/invalid setup-request transition/);
  });
});

describe("DeviceSetupRequest use-cases", () => {
  it("creates, lists (newest first), and advances status", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const create = new CreateDeviceSetupRequestUseCase(repo, runtime);
    const list = new ListDeviceSetupRequestsUseCase(repo, runtime);
    const update = new UpdateDeviceSetupRequestStatusUseCase(repo);

    const created = await create.execute({ manufacturer: "Teltonika", trackerType: "hardwired", useCase: "Telematics" });
    expect(created.status).toBe("pending_review");

    await update.execute({ id: created.id, tenantId: "t1", status: "approved" });
    const advanced = await update.execute({ id: created.id, tenantId: "t1", status: "in_progress" });
    expect(advanced.status).toBe("in_progress");

    const all = await list.execute({ tenantId: "t1" });
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("in_progress");
  });

  it("scopes listing by tenant", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const list = new ListDeviceSetupRequestsUseCase(repo, runtime);
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "a", tenantId: "t1" }));
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "b", tenantId: "t2" }));
    const t1 = await list.execute({ tenantId: "t1" });
    expect(t1).toHaveLength(1);
    expect(t1[0].tenantId).toBe("t1");
  });

  it("get rejects a setup request belonging to a different tenant", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const get = new GetDeviceSetupRequestUseCase(repo);
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "a", tenantId: "t1" }));

    await expect(() => get.execute("a", "t2")).rejects.toThrow(/not found/);
    await expect(get.execute("a", "t1")).resolves.toMatchObject({ id: "a", tenantId: "t1" });
  });

  it("update-status rejects a setup request belonging to a different tenant", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const update = new UpdateDeviceSetupRequestStatusUseCase(repo);
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "a", tenantId: "t1" }));

    await expect(() =>
      update.execute({ id: "a", tenantId: "t2", status: "in_progress" }),
    ).rejects.toThrow(/not found/);
  });
});
