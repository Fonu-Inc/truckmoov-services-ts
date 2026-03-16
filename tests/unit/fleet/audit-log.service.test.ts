import { describe, expect, it } from "vitest";
import { AuditLogService } from "../../../apps/fleet/src/audit-log.service";

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
  it("records and queries entries", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry());
    const results = svc.query("tenant-1", {});
    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe("job");
  });

  it("filters by entityType", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry({ entityType: "job" }));
    svc.record(makeEntry({ entityType: "alert" }));
    expect(svc.query("tenant-1", { entityType: "alert" })).toHaveLength(1);
  });

  it("filters by entityId", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry({ entityId: "job-1" }));
    svc.record(makeEntry({ entityId: "job-2" }));
    expect(svc.query("tenant-1", { entityId: "job-1" })).toHaveLength(1);
  });

  it("filters by action", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry({ action: "status.changed.assigned" }));
    svc.record(makeEntry({ action: "status.changed.delivered" }));
    expect(svc.query("tenant-1", { action: "status.changed.assigned" })).toHaveLength(1);
  });

  it("enforces tenant isolation", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry({ tenantId: "tenant-1" }));
    svc.record(makeEntry({ tenantId: "tenant-2" }));
    expect(svc.query("tenant-1", {})).toHaveLength(1);
    expect(svc.query("tenant-2", {})).toHaveLength(1);
  });

  it("returns newest first", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry({ action: "first" }));
    svc.record(makeEntry({ action: "second" }));
    const results = svc.query("tenant-1", {});
    expect(results[0].action).toBe("second");
  });

  it("respects limit", () => {
    const svc = new AuditLogService();
    for (let i = 0; i < 10; i++) svc.record(makeEntry());
    expect(svc.query("tenant-1", { limit: 3 })).toHaveLength(3);
  });

  it("assigns unique ids", () => {
    const svc = new AuditLogService();
    svc.record(makeEntry());
    svc.record(makeEntry());
    const [a, b] = svc.query("tenant-1", {});
    expect(a.id).not.toBe(b.id);
  });
});
