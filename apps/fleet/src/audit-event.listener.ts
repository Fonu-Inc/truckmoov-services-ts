import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { randomUUID } from "node:crypto";
import { AuditLogService, type AuditEntry } from "./audit-log.service";

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
        const entry: Omit<AuditEntry, "id"> = {
          tenantId: event.tenant_id,
          entityType: "job",
          entityId: String(d["job_id"] ?? ""),
          action: `status.changed.${d["new_status"]}`,
          actorId: String(d["driver_id"] ?? d["source"] ?? "system"),
          metadata: { previousStatus: d["previous_status"], newStatus: d["new_status"], source: d["source"] },
          occurredAt: event.occurred_at,
        };
        await this.audit.record(entry);
        await this.publishCentralActivity(event.tenant_id, {
          service: "dispatch",
          action: "job.status.changed",
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: `Job status changed to ${String(d["new_status"] ?? "").trim() || "unknown"}`,
          actorId: entry.actorId,
          metadata: entry.metadata,
          occurredAt: entry.occurredAt,
        });
      }),
      this.bus.subscribe("tm.*.alert.triggered", async (event) => {
        const d = event.data as Record<string, unknown>;
        const entry: Omit<AuditEntry, "id"> = {
          tenantId: event.tenant_id,
          entityType: "alert",
          entityId: String(d["alert_id"] ?? d["id"] ?? ""),
          action: "alert.triggered",
          actorId: "system",
          metadata: { type: d["type"], severity: d["severity"], vehicleId: d["vehicle_id"] },
          occurredAt: event.occurred_at,
        };
        await this.audit.record(entry);
        await this.publishCentralActivity(event.tenant_id, {
          service: "tracking",
          action: "alert.triggered",
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: "Fleet alert triggered",
          actorId: entry.actorId,
          metadata: entry.metadata,
          occurredAt: entry.occurredAt,
        });
      }),
      this.bus.subscribe("tm.*.vehicle.geofence.exited", async (event) => {
        const d = event.data as Record<string, unknown>;
        const entry: Omit<AuditEntry, "id"> = {
          tenantId: event.tenant_id,
          entityType: "geofence",
          entityId: String(d["vehicle_id"] ?? ""),
          action: "geofence.exited",
          actorId: "system",
          metadata: { vehicleId: d["vehicle_id"], lat: d["lat"], lng: d["lng"] },
          occurredAt: event.occurred_at,
        };
        await this.audit.record(entry);
        await this.publishCentralActivity(event.tenant_id, {
          service: "tracking",
          action: "vehicle.geofence.exited",
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: "Vehicle exited geofence",
          actorId: entry.actorId,
          metadata: entry.metadata,
          occurredAt: entry.occurredAt,
        });
      }),
      this.bus.subscribe("tm.*.vehicle.geofence.entered", async (event) => {
        const d = event.data as Record<string, unknown>;
        const entry: Omit<AuditEntry, "id"> = {
          tenantId: event.tenant_id,
          entityType: "geofence",
          entityId: String(d["vehicle_id"] ?? ""),
          action: "geofence.entered",
          actorId: "system",
          metadata: { vehicleId: d["vehicle_id"], lat: d["lat"], lng: d["lng"] },
          occurredAt: event.occurred_at,
        };
        await this.audit.record(entry);
        await this.publishCentralActivity(event.tenant_id, {
          service: "tracking",
          action: "vehicle.geofence.entered",
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: "Vehicle entered geofence",
          actorId: entry.actorId,
          metadata: entry.metadata,
          occurredAt: entry.occurredAt,
        });
      }),
    ]);

    this.unsubs.push(u1, u2, u3, u4);
    this.logger.log("Audit event listeners active");
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.unsubs.map((u) => u()));
  }

  private async publishCentralActivity(
    tenantId: string,
    activity: {
      service: string;
      action: string;
      entityType: string;
      entityId: string;
      summary: string;
      actorId: string;
      metadata: Record<string, unknown>;
      occurredAt: string;
    },
  ) {
    try {
      await this.bus.publish(`tm.${tenantId}.activity.logged`, {
        id: randomUUID(),
        type: "activity.logged",
        version: 1,
        occurred_at: activity.occurredAt,
        tenant_id: tenantId,
        actor: activity.actorId ? { id: activity.actorId, role: activity.actorId === "system" ? "system" : undefined } : undefined,
        data: {
          service: activity.service,
          action: activity.action,
          entity_type: activity.entityType,
          entity_id: activity.entityId,
          summary: activity.summary,
          metadata: activity.metadata,
        },
      });
    } catch (error) {
      this.logger.warn("central_activity_publish_failed", {
        tenantId,
        action: activity.action,
        error: (error as Error).message,
      });
    }
  }
}
