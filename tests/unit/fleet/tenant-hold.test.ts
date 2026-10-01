import "reflect-metadata";
import { NotFoundException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { emitDeviceIdentity } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/device-identity-emit";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { TenantHoldUseCases } from "../../../apps/fleet/src/contexts/fleet/tenant-hold/application/tenant-hold.use-cases";
import { InMemoryTenantHoldRepository } from "../../../apps/fleet/src/contexts/fleet/tenant-hold/infrastructure/in-memory-tenant-hold.repository";
import { InMemoryShareLinkRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-share-link.repository";
import { ViewSharedLocationUseCase, ShareLinkExpiredError } from "../../../apps/fleet/src/contexts/fleet/tracking/application/share-location.use-cases";
import { hashShareToken, shareLinkIsLive } from "../../../apps/fleet/src/contexts/fleet/tracking/domain/share-token";
import { PlatformActorGuard, PlatformOrTrackingGuard } from "../../../apps/fleet/src/platform-actor.guard";

const imei = (n: number) => `35977909001${String(n).padStart(4, "0")}`;

function device(n: number, tenantId = "t1", overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  return Device.create({
    id: `d${n}`, imei: imei(n), manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "1",
    tenantId, lifecycleStatus: "assigned", vehicleId: `v${n}`, signalStrength: null, batteryLevel: null,
    lastSeen: null, assignedAt: null, ...overrides,
  });
}

async function build() {
  const devices = new InMemoryDeviceRepository();
  const vehicleRows = [{ id: "v1", tenantId: "t1" }, { id: "v2", tenantId: "t1" }, { id: "v9", tenantId: "t2" }];
  const vehicles = { findAll: async (filter: { tenantId: string }) => vehicleRows.filter((row) => row.tenantId === filter.tenantId) };
  const events: Array<Record<string, unknown>> = [];
  const publisher = { publish: vi.fn(async (event: Record<string, unknown>) => { events.push(event); }) };
  const holds = new InMemoryTenantHoldRepository(devices, vehicles as never);
  const useCases = new TenantHoldUseCases(holds, publisher as never);
  await devices.save(device(1));
  await devices.save(device(2));
  await devices.save(device(3, "t2"));
  const cause = async (id: string) => (await devices.findByIdAcrossTenants(id))?.holdCause;
  return { devices, useCases, events, publisher, cause };
}

describe("tenant hold on devices", () => {
  it("holds every device and vehicle of the tenant without detaching anything", async () => {
    const t = await build();

    const counts = await t.useCases.suspend("t1", "non_payment", "Unpaid");

    expect(counts).toEqual({ devices: 2, vehicles: 2, shareLinks: 0 });
    expect(await t.cause("d1")).toBe("non_payment");
    expect(await t.cause("d3")).toBeNull();
    const kept = await t.devices.findByIdAcrossTenants("d1");
    expect(kept?.vehicleId).toBe("v1");
    expect(kept?.lifecycleStatus).toBe("assigned");
  });

  it("publishes one identity event per device with the vehicle kept and the flag set", async () => {
    const t = await build();
    await t.useCases.suspend("t1", "non_payment", "Unpaid");

    expect(t.events).toHaveLength(2);
    expect(t.events[0]).toMatchObject({
      tenant_id: "t1", action: "updated", suspended: true, suspension_cause: "non_payment", vehicle_id: "v1", imei: imei(1),
    });
  });

  it("is idempotent", async () => {
    const t = await build();
    await t.useCases.suspend("t1", "non_payment", "Unpaid");
    t.events.length = 0;

    expect(await t.useCases.suspend("t1", "non_payment", "Unpaid")).toEqual({ devices: 0, vehicles: 0, shareLinks: 0 });
    expect(t.events).toHaveLength(0);
  });

  it("releases only what the payment hold took", async () => {
    const t = await build();
    await t.devices.save(Device.create({ ...device(2).toPrimitives(), holdCause: "tenant_manual" }));
    await t.useCases.suspend("t1", "non_payment", "Unpaid");
    t.events.length = 0;

    const counts = await t.useCases.reinstate("t1", "non_payment");

    expect(counts.devices).toBe(1);
    expect(await t.cause("d1")).toBeNull();
    expect(await t.cause("d2")).toBe("tenant_manual");
    expect(t.events).toEqual([expect.objectContaining({ device_id: "d1", suspended: false, suspension_cause: null })]);
  });

  it("a staff suspension takes over payment holds and a staff reinstate frees both", async () => {
    const t = await build();
    await t.useCases.suspend("t1", "non_payment", "Unpaid");
    await t.useCases.suspend("t1", "manual", "Fraud review");

    expect(await t.cause("d1")).toBe("tenant_manual");
    expect(await t.useCases.reinstate("t1", "non_payment")).toMatchObject({ devices: 0 });
    expect(await t.cause("d1")).toBe("tenant_manual");

    await t.useCases.reinstate("t1", "manual");
    expect(await t.cause("d1")).toBeNull();
    expect(await t.cause("d2")).toBeNull();
  });

  it("holds a device whose lifecycle suspension is separate, and leaves that status alone", async () => {
    const t = await build();
    await t.devices.save(device(2, "t1", { lifecycleStatus: "suspended", vehicleId: null }));
    await t.useCases.suspend("t1", "non_payment", "Unpaid");
    await t.useCases.reinstate("t1", "non_payment");

    expect((await t.devices.findByIdAcrossTenants("d2"))?.lifecycleStatus).toBe("suspended");
  });

  it("a broker failure does not undo the hold", async () => {
    const t = await build();
    t.publisher.publish.mockRejectedValue(new Error("nats down"));

    await expect(t.useCases.suspend("t1", "non_payment", "Unpaid")).resolves.toMatchObject({ devices: 2 });
    expect(await t.cause("d1")).toBe("non_payment");
  });

  it("previews what would be held", async () => {
    const t = await build();
    expect(await t.useCases.preview(["t1", "t2"])).toEqual([
      { tenantId: "t1", devices: 2, vehicles: 2, shareLinks: 0 },
      { tenantId: "t2", devices: 1, vehicles: 1, shareLinks: 0 },
    ]);
  });

  it("pages held devices for tracking with a cursor", async () => {
    const t = await build();
    await t.useCases.suspend("t1", "non_payment", "Unpaid");
    await t.useCases.suspend("t2", "manual", "Review");

    const first = await t.useCases.heldDevices(2, null);
    expect(first.devices.map((entry) => entry.deviceId)).toEqual(["d1", "d2"]);
    expect(first.nextCursor).toBe("d2");
    const second = await t.useCases.heldDevices(2, first.nextCursor);
    expect(second.devices).toEqual([{ deviceId: "d3", imei: imei(3), tenantId: "t2", cause: "tenant_manual" }]);
    expect(second.nextCursor).toBeNull();
  });

  it("every other identity event carries the held flag so it cannot reopen a held device", async () => {
    const events: Array<Record<string, unknown>> = [];
    const held = Device.create({ ...device(1).toPrimitives(), holdCause: "non_payment" });
    await emitDeviceIdentity({ publish: async (event) => { events.push(event as never); } }, held, "assigned");
    await emitDeviceIdentity({ publish: async (event) => { events.push(event as never); } }, device(2), "updated");

    expect(events[0]).toMatchObject({ suspended: true, suspension_cause: "non_payment" });
    expect(events[1]).toMatchObject({ suspended: false, suspension_cause: null });
  });
});

describe("share links under a hold", () => {
  const link = (heldAt: Date | null) => ({
    id: "l1", tenantId: "t1", vehicleId: "v1", jobId: null, tokenHash: hashShareToken("tok"), createdBy: "u1",
    createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, lastViewedAt: null, viewCount: 0, heldAt,
  });

  it("reads a held link as expired and a released one as live again", () => {
    expect(shareLinkIsLive(link(new Date()))).toBe(false);
    expect(shareLinkIsLive(link(null))).toBe(true);
  });

  it("refuses a held link on the public view and does not count the view", async () => {
    const links = new InMemoryShareLinkRepository();
    await links.save(link(new Date()));
    const view = new ViewSharedLocationUseCase(links, { listLatestPositions: async () => [] } as never, { listJobs: async () => [] } as never);

    await expect(view.execute("tok")).rejects.toBeInstanceOf(ShareLinkExpiredError);
    await links.recordView("l1", new Date());
    expect((await links.findByTokenHash(hashShareToken("tok")))?.viewCount).toBe(0);
  });
});

describe("who may use the hold routes", () => {
  const ctx = (user?: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const tracking = { role: "PLATFORM_ADMIN", tenantId: "system", service: "tracking" };

  it("keeps the tracking service off every platform write route", () => {
    expect(() => new PlatformActorGuard().canActivate(ctx(tracking))).toThrow(NotFoundException);
  });

  it("lets tracking read the held list, and platform staff too, but nobody else", () => {
    const guard = new PlatformOrTrackingGuard();
    expect(guard.canActivate(ctx(tracking))).toBe(true);
    expect(guard.canActivate(ctx({ role: "PLATFORM_ADMIN", tenantId: "system" }))).toBe(true);
    expect(() => guard.canActivate(ctx({ role: "FLEET_ADMIN", tenantId: "t1" }))).toThrow(NotFoundException);
    expect(() => guard.canActivate(ctx({ role: "PLATFORM_ADMIN", tenantId: "t1", service: "dispatch" }))).toThrow(NotFoundException);
  });
});
