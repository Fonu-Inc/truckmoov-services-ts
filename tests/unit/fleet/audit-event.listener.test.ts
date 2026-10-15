import { describe, expect, it, vi } from "vitest";
import { AuditEventListener } from "../../../apps/fleet/src/audit-event.listener";
import { AuditLogService } from "../../../apps/fleet/src/audit-log.service";
import { InMemoryAuditLogRepository } from "../../../apps/fleet/src/in-memory-audit-log.repository";

function buildListener() {
  const handlers = new Map<string, (event: any) => Promise<void>>();
  const unsubFn = vi.fn().mockResolvedValue(undefined);
  const bus = {
    subscribe: vi.fn().mockImplementation((subject: string, handler: (event: any) => Promise<void>) => {
      handlers.set(subject, handler);
      return Promise.resolve(unsubFn);
    }),
  };
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const listener = new AuditEventListener(bus as any, audit);
  return { listener, bus, audit, handlers, unsubFn };
}

function makeEvent(tenantId: string, data: Record<string, unknown>) {
  return { tenant_id: tenantId, occurred_at: new Date().toISOString(), data };
}

describe("AuditEventListener", () => {
  it("subscribes to both subjects on bootstrap, each on its own durable", async () => {
    const { listener, bus } = buildListener();
    await listener.onApplicationBootstrap();
    expect(bus.subscribe).toHaveBeenCalledTimes(2);
    expect(bus.subscribe).toHaveBeenCalledWith("tm.*.job.status.changed", expect.any(Function), "audit_log");
    expect(bus.subscribe).toHaveBeenCalledWith("tm.*.alert.triggered", expect.any(Function), "audit_log");
  });

  it("records job status change audit entry", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.job.status.changed")!(
      makeEvent("t1", { job_id: "j1", new_status: "assigned", previous_status: "pending", driver_id: "d1" }),
    );
    const entries = await audit.query("t1", { entityType: "job" });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("status.changed.assigned");
    expect(entries[0].actorId).toBe("d1");
  });

  it("records alert triggered audit entry", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.alert.triggered")!(
      makeEvent("t1", { alert_id: "a1", type: "geofence_exit", severity: "high" }),
    );
    const entries = await audit.query("t1", { entityType: "alert" });
    expect(entries[0].action).toBe("alert.triggered");
  });

  it("uses system as actorId when no driver_id or source", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.job.status.changed")!(
      makeEvent("t1", { job_id: "j1", new_status: "pending" }),
    );
    expect((await audit.query("t1", {}))[0].actorId).toBe("system");
  });

  it("calls all unsub functions on shutdown", async () => {
    const { listener, unsubFn } = buildListener();
    await listener.onApplicationBootstrap();
    await listener.onApplicationShutdown();
    expect(unsubFn).toHaveBeenCalledTimes(2);
  });
});
