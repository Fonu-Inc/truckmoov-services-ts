import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session";
import { FleetFactsService } from "../../../apps/auth/src/fleet-facts.service";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { ReactivateTenantSimUseCase } from "../../../apps/auth/src/reactivate-tenant-sim.use-case";
import { SuspendSystemSimUseCase } from "../../../apps/auth/src/suspend-system-sim.use-case";
import { SuspendTenantSimUseCase } from "../../../apps/auth/src/suspend-tenant-sim.use-case";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";

const sim = (overrides: Partial<StoredSim> = {}): StoredSim => ({
  id: "s1", iccid: "i1", imsi: null, msisdn: null, carrier: "MTN", plan: "iot_basic", status: "assigned",
  tenantId: "t1", deviceId: "d1", deviceName: null, deviceImei: "359", deviceType: null, vehicleId: null,
  suspensionReason: null, notes: null, dataUsageMb: 0, dataLimitMb: 0, smsUsage: 0, smsLimit: 0,
  monthlyCostNgn: 0, activationDate: null, expiryDate: null, lastActivity: null, signalStrength: null,
  networkType: null, roaming: false, fonuSimId: null, fonuStatus: null, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

const staffTokens = { resolveAccessToken: () => ({ id: "sys1" }) };
const staff = { findById: async () => ({ id: "sys1", email: "a@x", role: "SYSTEM_ADMIN", tenantId: "system", passwordHash: "x" }) };
const tenantTokens = { resolveAccessToken: () => ({ id: "u1" }) };
const tenantUser = { findById: async () => ({ id: "u1", email: "u@x", role: "OWNER_OPERATOR", tenantId: "t1", passwordHash: "x" }) };

function events() {
  const sent: Array<{ sim_id: string; action: string; status: string }> = [];
  return { sent, publisher: { publish: async (event: never) => { sent.push(event); } } };
}

describe("single SIM suspension keeps its own cause", () => {
  it("staff suspend stamps the cause, the reason and the status it came from, and emits", async () => {
    const repo = new InMemorySimRepository();
    await repo.save(sim());
    const { sent, publisher } = events();

    await new SuspendSystemSimUseCase(staffTokens as never, staff as never, repo, publisher).execute("tok", "s1", true, "Lost device");

    expect(await repo.findById("s1")).toMatchObject({
      status: "suspended", suspensionCause: "asset_manual", suspensionReason: "Lost device", preSuspensionStatus: "assigned",
    });
    expect(sent).toEqual([expect.objectContaining({ sim_id: "s1", action: "suspended", status: "suspended" })]);
  });

  it("staff reactivate goes back to where the SIM was and clears the stamps", async () => {
    const repo = new InMemorySimRepository();
    await repo.save(sim());
    const { sent, publisher } = events();
    const useCase = new SuspendSystemSimUseCase(staffTokens as never, staff as never, repo, publisher);
    await useCase.execute("tok", "s1", true);
    await useCase.execute("tok", "s1", false);

    expect(await repo.findById("s1")).toMatchObject({
      status: "assigned", suspensionCause: null, suspensionReason: null, preSuspensionStatus: null,
    });
    expect(sent.map((event) => event.action)).toEqual(["suspended", "updated"]);
  });

  it("a tenant suspends its own SIM as an asset suspension and emits", async () => {
    const repo = new InMemorySimRepository();
    await repo.save(sim({ status: "active" }));
    const { sent, publisher } = events();

    await new SuspendTenantSimUseCase(tenantTokens as never, tenantUser as never, repo, publisher).execute("tok", "s1", { reason: "Stolen" });

    expect(await repo.findById("s1")).toMatchObject({ suspensionCause: "asset_manual", preSuspensionStatus: "active" });
    expect(sent).toHaveLength(1);
  });

  it("a tenant can reactivate its own SIM but not one the billing hold paused", async () => {
    const repo = new InMemorySimRepository();
    await repo.save(sim({ id: "own", status: "suspended", suspensionCause: "asset_manual", preSuspensionStatus: "assigned" }));
    await repo.save(sim({ id: "held", iccid: "i2", status: "suspended", suspensionCause: "non_payment", preSuspensionStatus: "assigned" }));
    const { publisher } = events();
    const useCase = new ReactivateTenantSimUseCase(tenantTokens as never, tenantUser as never, repo, publisher);

    await useCase.execute("tok", "own");
    await expect(useCase.execute("tok", "held")).rejects.toBeInstanceOf(ForbiddenError);

    expect((await repo.findById("own"))?.status).toBe("assigned");
    expect((await repo.findById("held"))?.status).toBe("suspended");
  });
});

describe("fleet hold calls", () => {
  afterEach(() => vi.restoreAllMocks());

  const service = () =>
    new FleetFactsService({
      auth: { jwtSecret: "secret", fleetServiceUrl: "http://fleet:3002" },
      identity: { legacySecret: "secret", serviceTokenDir: "/nonexistent", serviceAuthDevSecret: "dev-secret" },
    } as never);

  it("never calls out with an id that is not one we issued", async () => {
    const post = vi.spyOn(axios, "post");
    const result = await service().suspendTenantAssets("../../x", { cause: "non_payment", reason: "r", actor: { id: "system", name: "n" } });
    expect(result.ok).toBe(false);
    expect(await service().previewTenantHold(["../../x"])).toEqual(new Map());
    expect(post).not.toHaveBeenCalled();
  });

  it("reads counts from the fleet response and reports a refusal in plain words", async () => {
    vi.spyOn(axios, "post").mockResolvedValueOnce({ status: 200, data: { data: { devices: 4, vehicles: 3, shareLinks: 2 } } });
    expect(await service().suspendTenantAssets("t1", { cause: "manual", reason: "r", actor: { id: "a", name: "A" } })).toEqual({
      ok: true, devices: 4, vehicles: 3, shareLinks: 2,
    });

    vi.spyOn(axios, "post").mockResolvedValueOnce({ status: 404, data: { message: "Cannot POST /fleet/internal/tenants/t1/reinstate" } });
    expect(await service().reinstateTenantAssets("t1", "non_payment")).toEqual({
      ok: false, message: "The device service refused the change",
    });
  });

  it("treats an unreachable fleet as a failed step, never as zero", async () => {
    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await service().suspendTenantAssets("t1", { cause: "non_payment", reason: "r", actor: { id: "system", name: "n" } })).toEqual({
      ok: false, message: "The device service could not be reached",
    });

    vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await service().previewTenantHold(["t1"])).toBeNull();
  });
});
