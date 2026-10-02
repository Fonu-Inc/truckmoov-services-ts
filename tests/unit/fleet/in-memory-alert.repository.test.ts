import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAlertRepository } from "../../../apps/fleet/src/contexts/fleet/alerts/infrastructure/in-memory-alert.repository";
import { Alert } from "../../../apps/fleet/src/contexts/fleet/alerts/domain/alert.entity";

function makeAlert(id: string, tenantId = "t1", overrides: Partial<Parameters<typeof Alert.create>[0]> = {}) {
  return Alert.create({ id, tenantId, type: "geofence_exit", severity: "high", status: "open", vehicleId: "v1", jobId: null, details: {}, triggeredAt: new Date(), acknowledgedAt: null, resolvedAt: null, escalatedAt: null, acknowledgedBy: null, resolvedBy: null, ...overrides });
}

describe("InMemoryAlertRepository", () => {
  let repo: InMemoryAlertRepository;
  beforeEach(() => { repo = new InMemoryAlertRepository(); });

  it("saves and finds by id", async () => {
    const a = makeAlert("a1");
    await repo.save(a);
    expect(await repo.findById("t1", "a1")).toBe(a);
  });

  it("tenant isolation", async () => {
    await repo.save(makeAlert("a1", "t1"));
    expect(await repo.findById("t2", "a1")).toBeNull();
  });

  it("findAll returns all tenant alerts", async () => {
    await repo.save(makeAlert("a1", "t1"));
    await repo.save(makeAlert("a2", "t1"));
    await repo.save(makeAlert("a3", "t2"));
    expect(await repo.findAll("t1")).toHaveLength(2);
  });

  it("findAll filters by status", async () => {
    await repo.save(makeAlert("a1", "t1", { status: "open" }));
    await repo.save(makeAlert("a2", "t1", { status: "resolved" }));
    expect(await repo.findAll("t1", { status: "open" })).toHaveLength(1);
  });

  it("save overwrites existing alert", async () => {
    const a = makeAlert("a1");
    await repo.save(a);
    await repo.save(a.acknowledge("user-1"));
    expect((await repo.findById("t1", "a1"))?.status).toBe("acknowledged");
  });
});

describe("InMemoryAlertRepository open-alert scan", () => {
  it("returns only open alerts older than the cutoff, across tenants, oldest first", async () => {
    const repo = new InMemoryAlertRepository();
    const now = Date.now();
    await repo.save(makeAlert("old-a", "t1", { triggeredAt: new Date(now - 60_000) }));
    await repo.save(makeAlert("older-b", "t2", { triggeredAt: new Date(now - 120_000) }));
    await repo.save(makeAlert("fresh", "t1", { triggeredAt: new Date(now) }));
    await repo.save(makeAlert("done", "t1", { triggeredAt: new Date(now - 120_000), status: "resolved" }));

    const found = await repo.findOpenTriggeredBefore(new Date(now - 30_000), 10);
    expect(found.map((a) => a.id)).toEqual(["older-b", "old-a"]);
  });
});
