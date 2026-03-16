import { describe, expect, it, vi } from "vitest";
import { AuditEventListener } from "../../../apps/fleet/src/audit-event.listener";
import { AuditLogService } from "../../../apps/fleet/src/audit-log.service";

function buildListener() {
  const handlers = new Map<string, (event: any) => Promise<void>>();
  const unsubFn = vi.fn().mockResolvedValue(undefined);
  const bus = {
    subscribe: vi.fn().mockImplementation((subject: string, handler: (event: any) => Promise<void>) => {
      handlers.set(subject, handler);
      return Promise.resolve(unsubFn);
    }),
  };
  const audit = new AuditLogService();
  const listener = new AuditEventListener(bus as any, audit);
  return { listener, bus, audit, handlers, unsubFn };
}

function makeEvent(tenantId: string, data: Record<string, unknown>) {
  return { tenant_id: tenantId, occurred_at: new Date().toISOString(), data };
}

describe("AuditEventListener", () => {
  it("subscribes to all 4 subjects on bootstrap", async () => {
    const { listener, bus } = buildListener();
    await listener.onApplicationBootstrap();
    expect(bus.subscribe).toHaveBeenCalledTimes(4);
  });

  it("records job status change audit entry", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.job.status.changed")!(
      makeEvent("t1", { job_id: "j1", new_status: "assigned", previous_status: "pending", driver_id: "d1" }),
    );
    const entries = audit.query("t1", { entityType: "job" });
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
    const entries = audit.query("t1", { entityType: "alert" });
    expect(entries[0].action).toBe("alert.triggered");
  });

  it("records geofence exited audit entry", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.vehicle.geofence.exited")!(
      makeEvent("t1", { vehicle_id: "v1", lat: 6.5, lng: 3.4 }),
    );
    const entries = audit.query("t1", { entityType: "geofence" });
    expect(entries[0].action).toBe("geofence.exited");
  });

  it("records geofence entered audit entry", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.vehicle.geofence.entered")!(
      makeEvent("t1", { vehicle_id: "v1", lat: 6.5, lng: 3.4 }),
    );
    expect(audit.query("t1", { entityType: "geofence" })[0].action).toBe("geofence.entered");
  });

  it("uses system as actorId when no driver_id or source", async () => {
    const { listener, audit, handlers } = buildListener();
    await listener.onApplicationBootstrap();
    await handlers.get("tm.*.job.status.changed")!(
      makeEvent("t1", { job_id: "j1", new_status: "pending" }),
    );
    expect(audit.query("t1", {})[0].actorId).toBe("system");
  });

  it("calls all unsub functions on shutdown", async () => {
    const { listener, unsubFn } = buildListener();
    await listener.onApplicationBootstrap();
    await listener.onApplicationShutdown();
    expect(unsubFn).toHaveBeenCalledTimes(4);
  });
});
