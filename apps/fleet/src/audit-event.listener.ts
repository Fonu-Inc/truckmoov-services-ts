import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { AuditLogService } from "./audit-log.service";

@Injectable()
export class AuditEventListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuditEventListener.name);
  private readonly unsubs: Array<() => Promise<void>> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly audit: AuditLogService,
  ) {}

  async onApplicationBootstrap() {
    const [u1, u2, u3, u4] = await Promise.all([
      this.bus.subscribe("tm.*.job.status.changed", async (event) => {
        const d = event.data as Record<string, unknown>;
        this.audit.record({
          tenantId: event.tenant_id,
          entityType: "job",
          entityId: String(d["job_id"] ?? ""),
          action: `status.changed.${d["new_status"]}`,
          actorId: String(d["driver_id"] ?? d["source"] ?? "system"),
          metadata: { previousStatus: d["previous_status"], newStatus: d["new_status"], source: d["source"] },
          occurredAt: event.occurred_at,
        });
      }),
      this.bus.subscribe("tm.*.alert.triggered", async (event) => {
        const d = event.data as Record<string, unknown>;
        this.audit.record({
          tenantId: event.tenant_id,
          entityType: "alert",
          entityId: String(d["alert_id"] ?? d["id"] ?? ""),
          action: "alert.triggered",
          actorId: "system",
          metadata: { type: d["type"], severity: d["severity"], vehicleId: d["vehicle_id"] },
          occurredAt: event.occurred_at,
        });
      }),
      this.bus.subscribe("tm.*.vehicle.geofence.exited", async (event) => {
        const d = event.data as Record<string, unknown>;
        this.audit.record({
          tenantId: event.tenant_id,
          entityType: "geofence",
          entityId: String(d["vehicle_id"] ?? ""),
          action: "geofence.exited",
          actorId: "system",
          metadata: { vehicleId: d["vehicle_id"], lat: d["lat"], lng: d["lng"] },
          occurredAt: event.occurred_at,
        });
      }),
      this.bus.subscribe("tm.*.vehicle.geofence.entered", async (event) => {
        const d = event.data as Record<string, unknown>;
        this.audit.record({
          tenantId: event.tenant_id,
          entityType: "geofence",
          entityId: String(d["vehicle_id"] ?? ""),
          action: "geofence.entered",
          actorId: "system",
          metadata: { vehicleId: d["vehicle_id"], lat: d["lat"], lng: d["lng"] },
          occurredAt: event.occurred_at,
        });
      }),
    ]);

    this.unsubs.push(u1, u2, u3, u4);
    this.logger.log("Audit event listeners active");
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.unsubs.map((u) => u()));
  }
}
