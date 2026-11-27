import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { CreateSystemSimUseCase } from "../../../apps/auth/src/create-system-sim.use-case";
import { ImportSystemSimsUseCase } from "../../../apps/auth/src/import-system-sims.use-case";
import { DeleteSystemSimUseCase } from "../../../apps/auth/src/delete-system-sim.use-case";
import { UpdateSystemSimUseCase } from "../../../apps/auth/src/update-system-sim.use-case";
import {
  BulkSystemSimStatusUseCase,
  SimStatusNotAllowedError,
} from "../../../apps/auth/src/bulk-system-sim-status.use-case";
import { ListSystemSimsUseCase } from "../../../apps/auth/src/list-system-sims.use-case";
import { ExportSystemSimsUseCase } from "../../../apps/auth/src/export-system-sims.use-case";
import { SimNotFoundError } from "../../../apps/auth/src/get-system-sim-detail.use-case";
import { DuplicateSimIccidError, SimInUseError, newUnassignedSim } from "../../../apps/auth/src/system-sim-input";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session";
import type { StoredSim } from "../../../apps/auth/src/sim.repository";

const TOKEN = "sys-token";
const ICCID_A = "89234000000000000001";
const ICCID_B = "89234000000000000002";
const ICCID_C = "89234000000000000003";

const tokens = { resolveAccessToken: () => ({ id: "sys1" }) as never };
const userRepo = (role = "SYSTEM_ADMIN", tenantId = "system") => ({
  findById: async () => ({ id: "sys1", email: "a@system", passwordHash: "x", role, tenantId, accountStatus: "enabled" }),
});
const events = { publish: async () => {} };
const names = (map: Record<string, string> = {}) => ({
  organizationNameFor: async (id: string) => map[id] ?? null,
  organizationNamesFor: async (ids: string[]) => new Map(ids.filter((id) => map[id]).map((id) => [id, map[id]])),
  tenantIdsMatching: async (q: string) =>
    Object.entries(map).filter(([, name]) => name.toLowerCase().includes(q.toLowerCase())).map(([id]) => id),
});

function sim(overrides: Partial<StoredSim> = {}): StoredSim {
  return { ...newUnassignedSim({ iccid: ICCID_A, msisdn: "+2348031234567", carrier: "MTN" }), ...overrides };
}

describe("registering a SIM", () => {
  let repo: InMemorySimRepository;
  const make = (role?: string, tenantId?: string) =>
    new CreateSystemSimUseCase(tokens as never, userRepo(role, tenantId) as never, repo);
  beforeEach(() => {
    repo = new InMemorySimRepository();
  });

  it("saves it unassigned with no tenant or device", async () => {
    const result = await make().execute(TOKEN, { iccid: ICCID_A, msisdn: "+2348031234567", carrier: "Glo" });

    expect(result.data).toMatchObject({ status: "unassigned", tenantId: null, deviceId: null, carrier: "Glo" });
    expect((await repo.findByIccid(ICCID_A))?.id).toBe(result.data.id);
  });

  it("refuses a repeated ICCID", async () => {
    await make().execute(TOKEN, { iccid: ICCID_A, msisdn: "+2348031234567", carrier: "MTN" });

    await expect(
      make().execute(TOKEN, { iccid: ICCID_A, msisdn: "+2348031234568", carrier: "MTN" }),
    ).rejects.toBeInstanceOf(DuplicateSimIccidError);
  });

  it("refuses a phone number without +, a short ICCID and a missing carrier", async () => {
    await expect(make().execute(TOKEN, { iccid: ICCID_A, msisdn: "2348031234567", carrier: "MTN" })).rejects.toThrow();
    await expect(make().execute(TOKEN, { iccid: "123", msisdn: "+2348031234567", carrier: "MTN" })).rejects.toThrow();
    await expect(make().execute(TOKEN, { iccid: ICCID_A, msisdn: "+2348031234567", carrier: " " })).rejects.toThrow();
  });

  it("refuses non-system actors", async () => {
    await expect(
      make("ENTERPRISE_ADMIN", "t1").execute(TOKEN, { iccid: ICCID_A, msisdn: "+2348031234567", carrier: "MTN" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("importing SIMs", () => {
  let repo: InMemorySimRepository;
  const make = () => new ImportSystemSimsUseCase(tokens as never, userRepo() as never, repo);
  beforeEach(() => {
    repo = new InMemorySimRepository();
  });

  it("reports each row: imported, skipped, failed", async () => {
    await repo.save(sim({ id: "old", iccid: ICCID_B }));

    const result = await make().execute(TOKEN, [
      { iccid: ICCID_A, msisdn: "+2348031234567", carrier: "" },
      { iccid: ICCID_B, msisdn: "+2348031234568" },
      { iccid: ICCID_A, msisdn: "+2348031234569" },
      { iccid: ICCID_C, msisdn: "08031234567" },
    ]);

    expect(result.data.results.map((r) => r.outcome)).toEqual(["imported", "skipped", "skipped", "failed"]);
    expect(result.data).toMatchObject({ imported: 1, skipped: 2, failed: 1 });
    expect((await repo.findByIccid(ICCID_A))?.carrier).toBe("MTN");
    expect(await repo.findByIccid(ICCID_C)).toBeNull();
  });
});

describe("editing SIM identity", () => {
  let repo: InMemorySimRepository;
  const make = () => new UpdateSystemSimUseCase(tokens as never, userRepo() as never, repo, events as never);
  beforeEach(async () => {
    repo = new InMemorySimRepository();
    await repo.save(sim({ id: "s1", iccid: ICCID_A, msisdn: "2348031234567" }));
    await repo.save(sim({ id: "s2", iccid: ICCID_B }));
  });

  it("changes ICCID, phone, IMSI and carrier", async () => {
    await make().execute(TOKEN, "s1", { iccid: ICCID_C, msisdn: "+2348099999999", imsi: "621301234567890", carrier: "Zain" });

    expect(await repo.findById("s1")).toMatchObject({
      iccid: ICCID_C, msisdn: "+2348099999999", imsi: "621301234567890", carrier: "Zain",
    });
  });

  it("clears the IMSI when sent empty", async () => {
    await make().execute(TOKEN, "s1", { imsi: "621301234567890" });
    await make().execute(TOKEN, "s1", { imsi: "" });

    expect((await repo.findById("s1"))?.imsi).toBeNull();
  });

  it("refuses an ICCID another SIM holds", async () => {
    await expect(make().execute(TOKEN, "s1", { iccid: ICCID_B })).rejects.toBeInstanceOf(DuplicateSimIccidError);
  });

  it("leaves a legacy phone format alone when only the plan changes", async () => {
    await make().execute(TOKEN, "s1", { plan: "iot_premium" });

    expect(await repo.findById("s1")).toMatchObject({ plan: "iot_premium", msisdn: "2348031234567" });
  });
});

describe("deleting a SIM", () => {
  let repo: InMemorySimRepository;
  const make = () => new DeleteSystemSimUseCase(tokens as never, userRepo() as never, repo);
  beforeEach(async () => {
    repo = new InMemorySimRepository();
    await repo.save(sim({ id: "pool" }));
    await repo.save(sim({ id: "owned", iccid: ICCID_B, tenantId: "t1", status: "assigned" }));
  });

  it("removes a SIM nobody holds", async () => {
    const result = await make().execute(TOKEN, "pool");

    expect(result.data).toEqual({ id: "pool", iccid: ICCID_A });
    expect(await repo.findById("pool")).toBeNull();
  });

  it("refuses a SIM assigned to a tenant", async () => {
    await expect(make().execute(TOKEN, "owned")).rejects.toBeInstanceOf(SimInUseError);
    expect(await repo.findById("owned")).not.toBeNull();
  });

  it("reports an unknown SIM", async () => {
    await expect(make().execute(TOKEN, "nope")).rejects.toBeInstanceOf(SimNotFoundError);
  });
});

describe("bulk status", () => {
  let repo: InMemorySimRepository;
  const make = () => new BulkSystemSimStatusUseCase(tokens as never, userRepo() as never, repo, events as never);
  beforeEach(async () => {
    repo = new InMemorySimRepository();
    await repo.save(sim({ id: "act", iccid: ICCID_A, tenantId: "t1", status: "active" }));
    await repo.save(sim({ id: "asg", iccid: ICCID_B, tenantId: "t1", status: "assigned" }));
    await repo.save(sim({ id: "pool", iccid: ICCID_C }));
  });

  it("activates what it can and says why it skipped the rest", async () => {
    const result = await make().execute(TOKEN, ["act", "asg", "pool", "ghost"], "activate");

    expect(result.data.results.map((r) => [r.id, r.outcome, r.reason])).toEqual([
      ["act", "skipped", "Already active"],
      ["asg", "changed", null],
      ["pool", "skipped", "Assign to a tenant first"],
      ["ghost", "failed", "SIM not found"],
    ]);
    expect((await repo.findById("asg"))).toMatchObject({ status: "active" });
    expect((await repo.findById("asg"))?.activationDate).toBeInstanceOf(Date);
    expect(result.message).toContain("the mobile network has not been told");
  });

  it("suspends then reinstates back to the earlier status", async () => {
    await make().execute(TOKEN, ["act", "pool"], "suspend");
    expect((await repo.findById("act"))?.status).toBe("suspended");
    expect((await repo.findById("pool"))?.status).toBe("unassigned");

    const back = await make().execute(TOKEN, ["act"], "reinstate");

    expect(back.data.changed).toBe(1);
    expect((await repo.findById("act"))?.status).toBe("active");
  });

  it("activates a suspended SIM straight to active", async () => {
    await make().execute(TOKEN, ["asg"], "suspend");
    await make().execute(TOKEN, ["asg"], "activate");

    expect(await repo.findById("asg")).toMatchObject({ status: "active", suspensionReason: null });
  });

  it("counts a repeated id once", async () => {
    const result = await make().execute(TOKEN, ["asg", "asg"], "activate");

    expect(result.data.results).toHaveLength(1);
  });

  it("single activate refuses a SIM that cannot change", async () => {
    await expect(make().executeOne(TOKEN, "act", "activate")).rejects.toBeInstanceOf(SimStatusNotAllowedError);
  });
});

describe("listing and exporting", () => {
  let repo: InMemorySimRepository;
  const list = () =>
    new ListSystemSimsUseCase(tokens as never, userRepo() as never, repo, names({ t1: "Acme Haulage" }) as never);
  beforeEach(async () => {
    repo = new InMemorySimRepository();
    await repo.save(sim({ id: "a", iccid: ICCID_A, tenantId: "t1", status: "active", createdAt: new Date("2026-01-03") }));
    await repo.save(sim({ id: "b", iccid: ICCID_B, status: "registered", createdAt: new Date("2026-01-02") }));
    await repo.save(sim({ id: "c", iccid: ICCID_C, status: "unassigned", createdAt: new Date("2026-01-01") }));
  });

  it("finds SIMs by tenant name", async () => {
    const result = await list().execute(TOKEN, { search: "acme" });

    expect(result.data.sims.map((s) => s.id)).toEqual(["a"]);
    expect(result.data.sims[0].tenantName).toBe("Acme Haulage");
  });

  it("treats the unassigned filter as no tenant", async () => {
    const result = await list().execute(TOKEN, { status: "unassigned" });

    expect(result.data.sims.map((s) => s.id).sort()).toEqual(["b", "c"]);
  });

  it("limits the list to the given device ids", async () => {
    await repo.save(sim({ id: "d", iccid: "89234000000000000004", deviceId: "dev1" }));

    const hit = await list().execute(TOKEN, { deviceIds: ["dev1", "dev2"] });
    const none = await list().execute(TOKEN, { deviceIds: [] });

    expect(hit.data.sims.map((s) => s.id)).toEqual(["d"]);
    expect(none.data.total).toBe(0);
  });

  it("pages and reports the full total", async () => {
    const result = await list().execute(TOKEN, { page: 2, limit: 2 });

    expect(result.data.total).toBe(3);
    expect(result.data.sims.map((s) => s.id)).toEqual(["c"]);
  });

  it("exports every row with tenant name and no paging cap", async () => {
    for (let i = 0; i < 60; i += 1) {
      await repo.save(sim({ id: `x${i}`, iccid: `8923400000000001${String(i).padStart(4, "0")}` }));
    }

    const { csv, filename } = await new ExportSystemSimsUseCase(list()).execute(TOKEN, {});
    const lines = csv.split("\n");

    expect(lines).toHaveLength(64);
    expect(lines[0]).toContain("tenantName");
    expect(lines.some((l) => l.includes("Acme Haulage"))).toBe(true);
    expect(filename).toMatch(/^sim-inventory-.*\.csv$/);
  });
});
