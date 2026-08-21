import { describe, expect, it } from "vitest";
import { AuditLogService } from "../../../apps/fleet/src/audit-log.service";
import { InMemoryAuditLogRepository } from "../../../apps/fleet/src/in-memory-audit-log.repository";

function makeEntry(overrides: Partial<Parameters<AuditLogService["record"]>[0]> = {}) {
  return {
    tenantId: "tenant-1",
    entityType: "job" as const,
    entityId: "job-1",
    action: "status.changed.assigned",
    actorId: "driver-1",
    metadata: {},
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AuditLogService", () => {
  it("records and queries entries", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry());
    const results = await svc.query("tenant-1", {});
    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe("job");
  });

  it("filters by entityType", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry({ entityType: "job" }));
    await svc.record(makeEntry({ entityType: "alert" }));
    expect(await svc.query("tenant-1", { entityType: "alert" })).toHaveLength(1);
  });

  it("filters by entityId", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry({ entityId: "job-1" }));
    await svc.record(makeEntry({ entityId: "job-2" }));
    expect(await svc.query("tenant-1", { entityId: "job-1" })).toHaveLength(1);
  });

  it("filters by action", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry({ action: "status.changed.assigned" }));
    await svc.record(makeEntry({ action: "status.changed.delivered" }));
    expect(await svc.query("tenant-1", { action: "status.changed.assigned" })).toHaveLength(1);
  });

  it("enforces tenant isolation", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry({ tenantId: "tenant-1" }));
    await svc.record(makeEntry({ tenantId: "tenant-2" }));
    expect(await svc.query("tenant-1", {})).toHaveLength(1);
    expect(await svc.query("tenant-2", {})).toHaveLength(1);
  });

  it("returns newest first", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry({ action: "first" }));
    await svc.record(makeEntry({ action: "second" }));
    const results = await svc.query("tenant-1", {});
    expect(results[0].action).toBe("second");
  });

  it("respects limit", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    for (let i = 0; i < 10; i++) await svc.record(makeEntry());
    expect(await svc.query("tenant-1", { limit: 3 })).toHaveLength(3);
  });

  it("assigns unique ids", async () => {
    const svc = new AuditLogService(new InMemoryAuditLogRepository());
    await svc.record(makeEntry());
    await svc.record(makeEntry());
    const [a, b] = await svc.query("tenant-1", {});
    expect(a.id).not.toBe(b.id);
  });
});
