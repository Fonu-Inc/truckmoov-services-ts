import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemoryTenantSuspensionRepository } from "../../../apps/auth/src/mikro-tenant-suspension.repository";
import { InMemoryTenantAssetStore } from "../../../apps/auth/src/tenant-asset-store";
import {
  MAX_SUSPEND_ATTEMPTS,
  SYSTEM_ENFORCEMENT_ACTOR,
  TenantSuspensionService,
} from "../../../apps/auth/src/tenant-suspension.service";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";
import type { TenantHoldResult } from "../../../apps/auth/src/fleet-facts.service";

const TENANT = "t1";
const STAFF = { id: "sys1", name: "Ada Staff", role: "SYSTEM_ADMIN" };
const REASON = "Unpaid since 2026-10-01, grace of 3 days ended";

function sim(id: string, overrides: Partial<StoredSim> = {}): StoredSim {
  return {
    id, iccid: id, imsi: null, msisdn: null, carrier: "MTN", plan: "iot_basic", status: "assigned",
    tenantId: TENANT, deviceId: `dev-${id}`, deviceName: null, deviceImei: `imei-${id}`, deviceType: null,
    vehicleId: null, suspensionReason: null, notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0,
    smsLimit: 0, monthlyCostNgn: 0, activationDate: null, expiryDate: null, lastActivity: null,
    signalStrength: null, networkType: null, roaming: false, fonuSimId: null, fonuStatus: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

async function build() {
  const users = new InMemoryUserRepository();
  const sims = new InMemorySimRepository();
  const suspensions = new InMemoryTenantSuspensionRepository();
  const store = new InMemoryTenantAssetStore(users, sims);
  const published: Array<{ subject: string; type: string; data: Record<string, unknown> }> = [];
  const simEvents: Array<{ sim_id: string; action: string; status: string }> = [];
  const deleteAllForUser = vi.fn(async () => {});
  const changed = vi.fn();
  const fleetState = { failSuspend: false, failReinstate: false, calls: [] as string[] };
  const fleet = {
    suspendTenantAssets: vi.fn(async (_id: string, body: { cause: string }): Promise<TenantHoldResult> => {
      fleetState.calls.push(`suspend:${body.cause}`);
      return fleetState.failSuspend
        ? { ok: false, message: "fleet down" }
        : { ok: true, devices: 3, vehicles: 2, shareLinks: 1 };
    }),
    reinstateTenantAssets: vi.fn(async (_id: string, cause: string): Promise<TenantHoldResult> => {
      fleetState.calls.push(`reinstate:${cause}`);
      return fleetState.failReinstate
        ? { ok: false, message: "fleet down" }
        : { ok: true, devices: 3, vehicles: 2, shareLinks: 1 };
    }),
    previewTenantHold: vi.fn(async () => new Map([[TENANT, { devices: 3, vehicles: 2, shareLinks: 1 }]])),
  };
  const service = new TenantSuspensionService(
    {} as never,
    suspensions,
    users,
    sims,
    { deleteAllForUser } as never,
    { changed } as never,
    fleet as never,
    {
      publish: async (subject: string, envelope: { type: string; data: Record<string, unknown> }) => {
        published.push({ subject, type: envelope.type, data: envelope.data });
      },
    } as never,
    { publish: async (event: { sim_id: string; action: string; status: string }) => { simEvents.push(event); } },
    store,
  );

  const addUser = (id: string, accountStatus: "enabled" | "disabled" = "enabled", tenantId = TENANT) =>
    users.save({ id, email: `${id}@x.test`, passwordHash: "x", role: "OWNER_OPERATOR", tenantId, accountStatus });
  const statusOf = async (id: string) => (await users.findById(id))?.accountStatus;
  const simStatus = async (id: string) => (await sims.findById(id))?.status;
  const types = () => published.map((event) => event.type);

  return { service, users, sims, suspensions, store, published, simEvents, deleteAllForUser, changed, fleet, fleetState, addUser, statusOf, simStatus, types };
}

const autoSuspend = (t: Awaited<ReturnType<typeof build>>) =>
  t.service.suspend(TENANT, {
    cause: "non_payment", reason: REASON, actor: SYSTEM_ENFORCEMENT_ACTOR, unpaidSince: "2026-10-01", graceDays: 3,
  });

describe("TenantSuspensionService suspend", () => {
  it("holds users, devices, SIMs, vehicles and share links and stamps the reason", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.addUser("u2");
    await t.sims.save(sim("s1"));
    await t.sims.save(sim("s2", { status: "active", deviceId: null }));

    const result = await autoSuspend(t);

    expect(result).toMatchObject({ status: "complete", cause: "non_payment" });
    expect(result.counts).toEqual({ users: 2, devices: 3, sims: 2, vehicles: 2, shareLinks: 1 });
    expect(await t.statusOf("u1")).toBe("disabled");
    expect(t.deleteAllForUser).toHaveBeenCalledTimes(2);
    expect(t.changed).toHaveBeenCalledTimes(2);
    expect(await t.simStatus("s1")).toBe("suspended");
    expect((await t.sims.findById("s1"))?.suspensionReason).toBe(REASON);
    const row = await t.suspensions.findOne(TENANT);
    expect(row).toMatchObject({ cause: "non_payment", unpaidSince: "2026-10-01", graceDays: 3, cascadeStatus: "complete", reason: REASON });
    expect(row?.cascadeCompletedAt).toBeInstanceOf(Date);
    expect(t.fleetState.calls).toEqual(["suspend:non_payment"]);
  });

  it("publishes the tenant event once users are blocked, then the assets event", async () => {
    const t = await build();
    await t.addUser("u1");
    await autoSuspend(t);

    expect(t.types()).toEqual(["tenant.suspended", "tenant.assets.suspended"]);
    expect(t.published[0].data).toMatchObject({ cause: "non_payment", reason: REASON, unpaid_since: "2026-10-01", status: "suspended" });
    expect(t.published[1].data).toMatchObject({ complete: true, counts: { users: 1, devices: 3, sims: 0, vehicles: 2, share_links: 1 } });
  });

  it("emits sim.changed suspended for SIMs that have a device only", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    await t.sims.save(sim("s2", { deviceId: null }));
    await autoSuspend(t);

    expect(t.simEvents).toEqual([expect.objectContaining({ sim_id: "s1", action: "suspended", status: "suspended" })]);
  });

  it("leaves users and SIMs that were already off for another reason alone", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.addUser("off", "disabled");
    await t.sims.save(sim("s1"));
    await t.sims.save(sim("gone", { status: "deactivated" }));
    await t.sims.save(sim("held", { status: "suspended" }));

    const result = await autoSuspend(t);

    expect(result.counts.users).toBe(1);
    expect(result.counts.sims).toBe(1);
    expect(await t.simStatus("gone")).toBe("deactivated");
  });

  it("does not touch another tenant", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.addUser("other", "enabled", "t2");
    await t.sims.save(sim("o1", { tenantId: "t2" }));
    await autoSuspend(t);

    expect(await t.statusOf("other")).toBe("enabled");
    expect(await t.simStatus("o1")).toBe("assigned");
  });

  it("is idempotent: a second automatic run changes and announces nothing", async () => {
    const t = await build();
    await t.addUser("u1");
    await autoSuspend(t);
    const events = t.published.length;
    const second = await autoSuspend(t);

    expect(second.counts).toEqual({ users: 0, devices: 0, sims: 0, vehicles: 0, shareLinks: 0 });
    expect(t.published).toHaveLength(events);
    expect(t.fleet.suspendTenantAssets).toHaveBeenCalledTimes(1);
    expect(await t.suspensions.findAll()).toHaveLength(1);
  });

  it("never overwrites a manual row with an automatic suspension", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.service.suspend(TENANT, { cause: "manual", reason: "Fraud review", actor: STAFF });
    await autoSuspend(t);

    expect(await t.suspensions.findOne(TENANT)).toMatchObject({ cause: "manual", reason: "Fraud review" });
  });
});

describe("TenantSuspensionService partial failure", () => {
  it("blocks users even when fleet fails, still does SIMs, and reports the failed step", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    t.fleetState.failSuspend = true;

    const result = await autoSuspend(t);

    expect(result).toMatchObject({ status: "partial", failedStep: "fleet", error: "fleet down" });
    expect(await t.statusOf("u1")).toBe("disabled");
    expect(await t.simStatus("s1")).toBe("suspended");
    expect(await t.suspensions.findOne(TENANT)).toMatchObject({
      cascadeStatus: "partial",
      cascadeAttempts: 1,
      cascadeLastError: "fleet: fleet down",
      cascadeProgress: expect.objectContaining({ users: "done", fleet: "failed", sims: "done" }),
    });
    expect(t.types()).toEqual(["tenant.suspended", "tenant.assets.suspended"]);
    expect(t.published[1].data).toMatchObject({ complete: false });
  });

  it("a users-step failure does not skip fleet and SIMs", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    vi.spyOn(t.store, "holdUsers").mockRejectedValueOnce(new Error("db blip"));

    const result = await autoSuspend(t);

    expect(result).toMatchObject({ status: "partial", failedStep: "users" });
    expect(t.fleet.suspendTenantAssets).toHaveBeenCalled();
    expect(await t.simStatus("s1")).toBe("suspended");
    expect(t.types()).not.toContain("tenant.suspended");
  });

  it("resume finishes only what remains and announces the tenant event once", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    vi.spyOn(t.store, "holdUsers").mockRejectedValueOnce(new Error("db blip"));
    await autoSuspend(t);

    const resumed = await t.service.resume(TENANT);

    expect(resumed.status).toBe("complete");
    expect(await t.statusOf("u1")).toBe("disabled");
    expect(t.fleet.suspendTenantAssets).toHaveBeenCalledTimes(1);
    expect(t.types().filter((type) => type === "tenant.suspended")).toHaveLength(1);
    expect(resumed.counts).toEqual({ users: 1, devices: 3, sims: 1, vehicles: 2, shareLinks: 1 });
    expect((await t.suspensions.findOne(TENANT))?.cascadeStatus).toBe("complete");
  });

  it("resume retries fleet after it recovers and lists incomplete work meanwhile", async () => {
    const t = await build();
    await t.addUser("u1");
    t.fleetState.failSuspend = true;
    await autoSuspend(t);

    expect(await t.service.listIncomplete()).toEqual([{ tenantId: TENANT, phase: "suspend", attempts: 1 }]);
    t.fleetState.failSuspend = false;
    const resumed = await t.service.resume(TENANT);

    expect(resumed.status).toBe("complete");
    expect(await t.service.listIncomplete()).toEqual([]);
  });

  it("gives up retrying a suspension after the attempt limit", async () => {
    const t = await build();
    await t.addUser("u1");
    t.fleetState.failSuspend = true;
    await autoSuspend(t);
    for (let i = 0; i < MAX_SUSPEND_ATTEMPTS + 3; i += 1) await t.service.resume(TENANT);

    expect(t.fleet.suspendTenantAssets).toHaveBeenCalledTimes(MAX_SUSPEND_ATTEMPTS);
    expect((await t.suspensions.findOne(TENANT))?.cascadeStatus).toBe("partial");
  });
});

describe("TenantSuspensionService restore", () => {
  it("restores only what the cascade suspended", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.addUser("off", "disabled");
    await t.sims.save(sim("s1"));
    await t.sims.save(sim("s-active", { status: "active", deviceId: null }));
    await t.sims.save(sim("mine", { status: "suspended" }));
    await autoSuspend(t);
    t.published.length = 0;

    const result = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });

    expect(result).toMatchObject({ restored: true, status: "complete" });
    expect(await t.statusOf("u1")).toBe("enabled");
    expect(await t.statusOf("off")).toBe("disabled");
    expect(await t.simStatus("s1")).toBe("assigned");
    expect(await t.simStatus("s-active")).toBe("active");
    expect(await t.simStatus("mine")).toBe("suspended");
    expect(await t.suspensions.findOne(TENANT)).toBeNull();
    expect(t.types()).toEqual(["tenant.reinstated", "tenant.assets.restored"]);
    expect(t.published[0].data).toMatchObject({ restored_by: "payment", cause: "non_payment" });
    expect(t.simEvents.filter((event) => event.action === "updated").map((event) => event.sim_id)).toEqual(["s1"]);
    expect(t.fleetState.calls).toContain("reinstate:non_payment");
  });

  it("does not restore a staff suspension on payment", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.service.suspend(TENANT, { cause: "manual", reason: "Fraud review", actor: STAFF });

    const result = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });

    expect(result).toMatchObject({ restored: false, skipped: "manual_hold" });
    expect(await t.statusOf("u1")).toBe("disabled");
    expect(await t.suspensions.findOne(TENANT)).not.toBeNull();
  });

  it("reports a tenant that is not suspended", async () => {
    const t = await build();
    expect(await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR })).toMatchObject({
      restored: false,
      skipped: "not_suspended",
    });
  });

  it("keeps the row and retries when fleet fails, then finishes on resume", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    await autoSuspend(t);
    t.fleetState.failReinstate = true;

    const partial = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });

    expect(partial).toMatchObject({ restored: false, status: "partial", failedStep: "fleet" });
    expect(await t.statusOf("u1")).toBe("enabled");
    expect(await t.simStatus("s1")).toBe("assigned");
    expect((await t.suspensions.findOne(TENANT))?.cascadeStatus).toBe("restore_partial");
    expect(await t.service.listIncomplete()).toEqual([{ tenantId: TENANT, phase: "restore", attempts: 1 }]);

    t.fleetState.failReinstate = false;
    const resumed = await t.service.resume(TENANT);

    expect(resumed.status).toBe("complete");
    expect(await t.suspensions.findOne(TENANT)).toBeNull();
    expect(t.types().filter((type) => type === "tenant.reinstated")).toHaveLength(1);
    expect(t.types().filter((type) => type === "tenant.assets.restored")).toHaveLength(1);
  });

  it("is idempotent: restoring twice does nothing the second time", async () => {
    const t = await build();
    await t.addUser("u1");
    await autoSuspend(t);
    await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });
    const events = t.published.length;
    const again = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });

    expect(again.restored).toBe(false);
    expect(t.published).toHaveLength(events);
  });
});

describe("TenantSuspensionService staff takeover", () => {
  it("turns a payment suspension into a manual one that payment can no longer lift", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.sims.save(sim("s1"));
    await autoSuspend(t);
    await t.addUser("u-late");

    await t.service.suspend(TENANT, { cause: "manual", reason: "Fraud review", actor: STAFF });

    expect(await t.suspensions.findOne(TENANT)).toMatchObject({ cause: "manual", suspendedBy: STAFF.id, unpaidSince: "2026-10-01" });
    expect(t.store.userCauses.get("u1")).toBe("tenant_manual");
    expect(t.store.userCauses.get("u-late")).toBe("tenant_manual");
    expect(t.store.simCauses.get("s1")).toBe("tenant_manual");
    expect(t.fleetState.calls.at(-1)).toBe("suspend:manual");
    const paid = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });
    expect(paid.skipped).toBe("manual_hold");
  });

  it("staff reinstate lifts everything and waives the debt it overrode", async () => {
    const t = await build();
    await t.addUser("u1");
    await autoSuspend(t);
    await t.service.suspend(TENANT, { cause: "manual", reason: "Fraud review", actor: STAFF });

    const result = await t.service.restore(TENANT, { cause: "manual", actor: STAFF });

    expect(result.restored).toBe(true);
    expect(await t.statusOf("u1")).toBe("enabled");
    expect(t.store.waivers).toEqual([{ tenantId: TENANT, unpaidSince: "2026-10-01" }]);
    expect(t.published.find((event) => event.type === "tenant.reinstated" && event.data.restored_by === "staff")).toBeTruthy();
  });

  it("a plain staff suspension writes no waiver on reinstate", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.service.suspend(TENANT, { cause: "manual", reason: "Fraud review", actor: STAFF });
    await t.service.restore(TENANT, { cause: "manual", actor: STAFF });

    expect(t.store.waivers).toEqual([]);
  });
});

describe("TenantSuspensionService reconcile, locking and preview", () => {
  it("holds users and SIMs created after the suspension", async () => {
    const t = await build();
    await t.addUser("u1");
    await autoSuspend(t);
    await t.addUser("late");
    await t.sims.save(sim("late-sim"));

    const result = await t.service.reconcile(TENANT);

    expect(result.status).toBe("complete");
    expect(await t.statusOf("late")).toBe("disabled");
    expect(await t.simStatus("late-sim")).toBe("suspended");
    const restored = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });
    expect(restored.restored).toBe(true);
    expect(await t.statusOf("late")).toBe("enabled");
  });

  it("reconcile ignores tenants that are not suspended", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.service.reconcile(TENANT);
    expect(await t.statusOf("u1")).toBe("enabled");
  });

  it("a second caller skips while the first holds the tenant lock", async () => {
    const t = await build();
    await t.addUser("u1");
    let release!: () => void;
    t.fleet.suspendTenantAssets.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, devices: 0, vehicles: 0, shareLinks: 0 }); }),
    );

    const first = autoSuspend(t);
    await vi.waitFor(() => expect(t.fleet.suspendTenantAssets).toHaveBeenCalled());
    const second = await t.service.restore(TENANT, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });
    release();
    await first;

    expect(second).toMatchObject({ busy: true, restored: false });
  });

  it("previews what a suspension would hold, from auth and fleet together", async () => {
    const t = await build();
    await t.addUser("u1");
    await t.addUser("u2");
    await t.addUser("off", "disabled");
    await t.sims.save(sim("s1"));

    const counts = await t.service.previewAssets([TENANT, "t9"]);

    expect(counts.get(TENANT)).toEqual({ users: 2, devices: 3, sims: 1, vehicles: 2, shareLinks: 1 });
    expect(counts.get("t9")).toEqual({ users: 0, devices: 0, sims: 0, vehicles: 0, shareLinks: 0 });
  });
});
