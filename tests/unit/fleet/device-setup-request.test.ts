import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  DEVICE_SETUP_REQUEST_STATUSES,
  DeviceSetupRequest,
  type DeviceSetupRequestStatus,
} from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/domain/entities/device-setup-request.entity";
import {
  SETUP_REQUEST_REFERENCE_PATTERN,
  nextSetupRequestReference,
} from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/domain/device-setup-request-reference";
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

const catalog = {
  carriers: [{ id: "car-mtn", name: "MTN", code: "MTN", status: "active" }],
  bundles: [
    { id: "b-mtn-1gb", carrierId: "car-mtn", name: "MTN 1GB", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 1000, status: "active" },
    { id: "b-glo-1gb", carrierId: "car-glo", name: "Glo 1GB", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 900, status: "active" },
  ],
};
const authCatalog = { read: vi.fn().mockResolvedValue(catalog) };

function baseInput() {
  return { id: "r1", tenantId: "t1", referenceNumber: "DVR-100001", useCase: "Long-haul GPS tracking" };
}

function at(status: DeviceSetupRequestStatus) {
  return DeviceSetupRequest.fromPrimitives({ ...DeviceSetupRequest.create(baseInput()).toPrimitives(), status });
}

const ALLOWED: Array<[DeviceSetupRequestStatus, DeviceSetupRequestStatus]> = [
  ["under_review", "awaiting_payment"],
  ["under_review", "rejected"],
  ["under_review", "cancelled"],
  ["awaiting_payment", "ready_for_installation"],
  ["awaiting_payment", "cancelled"],
  ["ready_for_installation", "installation_in_progress"],
  ["ready_for_installation", "cancelled"],
  ["installation_in_progress", "completed"],
  ["installation_in_progress", "cancelled"],
];

const REFUSED = DEVICE_SETUP_REQUEST_STATUSES.flatMap((from) =>
  DEVICE_SETUP_REQUEST_STATUSES.filter(
    (to) => to !== from && !ALLOWED.some(([f, t]) => f === from && t === to),
  ).map((to) => [from, to] as [DeviceSetupRequestStatus, DeviceSetupRequestStatus]),
);

describe("DeviceSetupRequest entity", () => {
  it("creates under review with a seeded timeline and no hardware choice", () => {
    const p = DeviceSetupRequest.create(baseInput()).toPrimitives();
    expect(p.status).toBe("under_review");
    expect(p.referenceNumber).toBe("DVR-100001");
    expect(p.manufacturer).toBeNull();
    expect(p.trackerType).toBeNull();
    expect(p.quantity).toBe(1);
    expect(p.simRequired).toBe(false);
    expect(p.timeline.map((t) => t.status)).toEqual(["under_review"]);
  });

  it("still keeps a manufacturer and tracker type when sent", () => {
    const p = DeviceSetupRequest.create({ ...baseInput(), manufacturer: " Teltonika ", trackerType: "obd" }).toPrimitives();
    expect(p).toMatchObject({ manufacturer: "Teltonika", trackerType: "obd" });
  });

  it("requires a reference number", () => {
    expect(() => DeviceSetupRequest.create({ ...baseInput(), referenceNumber: "" })).toThrow(/referenceNumber/);
  });

  it("requires a carrier when a SIM is requested", () => {
    expect(() => DeviceSetupRequest.create({ ...baseInput(), simRequired: true })).toThrow(/carrierId/);
  });

  it("rejects an invalid tracker type", () => {
    expect(() => DeviceSetupRequest.create({ ...baseInput(), trackerType: "rocket" as never })).toThrow(/trackerType/);
  });

  it("covers every pair of statuses as allowed or refused", () => {
    expect(ALLOWED.length + REFUSED.length).toBe(DEVICE_SETUP_REQUEST_STATUSES.length * (DEVICE_SETUP_REQUEST_STATUSES.length - 1));
  });

  it.each(ALLOWED)("allows %s -> %s", (from, to) => {
    const next = at(from).transitionTo(to, "step");
    expect(next.status).toBe(to);
    expect(next.toPrimitives().timeline.at(-1)).toMatchObject({ status: to, note: "step" });
  });

  it.each(REFUSED)("refuses %s -> %s", (from, to) => {
    expect(() => at(from).transitionTo(to)).toThrow(/invalid setup-request transition/);
  });

  it("follows the design lifecycle end to end", () => {
    const req = DeviceSetupRequest.create(baseInput())
      .decide("awaiting_payment", "admin-1")
      .transitionTo("ready_for_installation")
      .transitionTo("installation_in_progress")
      .transitionTo("completed");

    expect(req.toPrimitives().timeline.map((t) => t.status)).toEqual([
      "under_review",
      "awaiting_payment",
      "ready_for_installation",
      "installation_in_progress",
      "completed",
    ]);
  });

  it("approval lands in awaiting_payment and records who decided", () => {
    const approved = DeviceSetupRequest.create(baseInput()).decide("awaiting_payment", "admin-1", "ok");
    expect(approved.toPrimitives()).toMatchObject({ status: "awaiting_payment", decidedBy: "admin-1" });
  });

  it("records who rejected, and refuses a rejection with no reason", () => {
    const rejected = DeviceSetupRequest.create(baseInput()).decide("rejected", "admin-1", "Model deprecated");
    expect(rejected.toPrimitives()).toMatchObject({
      status: "rejected",
      decidedBy: "admin-1",
      decisionReason: "Model deprecated",
    });

    expect(() => DeviceSetupRequest.create(baseInput()).decide("rejected", "admin-1")).toThrow(/reason/);
  });
});

describe("DeviceSetupRequest reference", () => {
  it("draws DVR- and six digits", async () => {
    const reference = await nextSetupRequestReference(async () => false);
    expect(reference).toMatch(SETUP_REQUEST_REFERENCE_PATTERN);
  });

  it("draws again when a reference is taken", async () => {
    const draws = [401882, 401882, 512000];
    const taken = new Set(["DVR-401882"]);
    const reference = await nextSetupRequestReference(async (r) => taken.has(r), () => draws.shift()!);
    expect(reference).toBe("DVR-512000");
  });

  it("gives up rather than loop forever", async () => {
    await expect(nextSetupRequestReference(async () => true, () => 100001)).rejects.toThrow(/reference/);
  });

  it("gives each created request its own reference, unique across tenants", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const create = new CreateDeviceSetupRequestUseCase(repo, runtime, authCatalog);
    const created = await Promise.all(
      ["t1", "t2", "t1", "t3"].map((tenantId) => create.execute({ tenantId, useCase: "Telematics" })),
    );
    const references = created.map((r) => r.referenceNumber);
    expect(new Set(references).size).toBe(references.length);
    expect(references.every((r) => SETUP_REQUEST_REFERENCE_PATTERN.test(r))).toBe(true);
    for (const r of references) expect(await repo.referenceExists(r)).toBe(true);
    expect(await repo.referenceExists("DVR-000000")).toBe(false);
  });

  it("finds a request by its reference in the tenant's list search", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const list = new ListDeviceSetupRequestsUseCase(repo, runtime);
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "a", referenceNumber: "DVR-401882" }));
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "b", referenceNumber: "DVR-512000" }));

    const found = await list.execute({ tenantId: "t1", query: "dvr-4018" });
    expect(found.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("DeviceSetupRequest use-cases", () => {
  it("creates without manufacturer or tracker type, lists, and lets the tenant cancel", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const create = new CreateDeviceSetupRequestUseCase(repo, runtime, authCatalog);
    const list = new ListDeviceSetupRequestsUseCase(repo, runtime);
    const update = new UpdateDeviceSetupRequestStatusUseCase(repo);

    const created = await create.execute({ useCase: "Telematics", quantity: 3 });
    expect(created).toMatchObject({ status: "under_review", manufacturer: null, trackerType: null, quantity: 3 });

    const cancelled = await update.execute({ id: created.id, tenantId: "t1", status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");

    const all = await list.execute({ tenantId: "t1", status: "cancelled" });
    expect(all.map((r) => r.id)).toEqual([created.id]);
  });

  // A tenant approving, rejecting or confirming payment on its own request
  // would skip the platform entirely.
  it.each(["awaiting_payment", "ready_for_installation", "rejected"] as const)(
    "refuses a tenant setting %s",
    async (status) => {
      const repo = new InMemoryDeviceSetupRequestRepository();
      const update = new UpdateDeviceSetupRequestStatusUseCase(repo);
      await repo.save(at(status === "ready_for_installation" ? "awaiting_payment" : "under_review"));

      await expect(update.execute({ id: "r1", tenantId: "t1", status })).rejects.toThrow(/set by the platform/);
      expect((await repo.findById("r1", "t1"))!.status).not.toBe(status);
    },
  );

  it("lets the tenant step installation along once the platform has handed it over", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const update = new UpdateDeviceSetupRequestStatusUseCase(repo);
    await repo.save(at("installation_in_progress"));

    await expect(update.execute({ id: "r1", tenantId: "t1", status: "completed" })).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("scopes listing by tenant", async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const list = new ListDeviceSetupRequestsUseCase(repo, runtime);
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "a", tenantId: "t1" }));
    await repo.save(DeviceSetupRequest.create({ ...baseInput(), id: "b", tenantId: "t2", referenceNumber: "DVR-100002" }));
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
      update.execute({ id: "a", tenantId: "t2", status: "cancelled" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("DeviceSetupRequest SIM pick against the auth catalog", () => {
  const command = { useCase: "Telematics", simRequired: true };

  function harness(reader = { read: vi.fn().mockResolvedValue(catalog) }) {
    const repo = new InMemoryDeviceSetupRequestRepository();
    return { repo, reader, create: new CreateDeviceSetupRequestUseCase(repo, runtime, reader) };
  }

  it("accepts a carrier and bundle auth sells", async () => {
    const { create } = harness();
    const created = await create.execute({ ...command, carrierId: "car-mtn", bundleId: "b-mtn-1gb" });
    expect(created).toMatchObject({ carrierId: "car-mtn", bundleId: "b-mtn-1gb" });
  });

  it.each([
    [{ carrierId: "carrier-mtn" }, /carrierId is not in the carrier catalog/],
    [{ carrierId: "car-mtn", bundleId: "bundle-mtn-monthly-1gb" }, /bundleId is not in the data bundle catalog/],
    [{ carrierId: "car-mtn", bundleId: "b-glo-1gb" }, /bundleId does not belong to carrierId/],
  ])("refuses %o and stores nothing", async (pick, message) => {
    const { create, repo } = harness();
    await expect(create.execute({ ...command, ...pick })).rejects.toThrow(message);
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(0);
  });

  it("answers 503 when auth cannot be asked, and stores nothing", async () => {
    const { create, repo } = harness({ read: vi.fn().mockResolvedValue(null) });
    await expect(create.execute({ ...command, carrierId: "car-mtn" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(0);
  });

  it("does not ask auth when no SIM is picked", async () => {
    const { create, reader } = harness();
    await create.execute({ useCase: "Telematics" });
    expect(reader.read).not.toHaveBeenCalled();
  });
});
