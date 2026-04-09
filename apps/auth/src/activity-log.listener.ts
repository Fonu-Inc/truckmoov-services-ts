import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { EVENT_BUS, type EventBus, type EventEnvelope } from "@shared/eventbus";
import { ActivityLogService } from "./activity-log.service";

@Injectable()
export class ActivityLogListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ActivityLogListener.name);
  private readonly unsubs: Array<() => Promise<void>> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly activityLog: ActivityLogService,
  ) {}

  async onApplicationBootstrap() {
    const [activityUnsub, deliveryUnsub] = await Promise.all([
      this.bus.subscribe("tm.*.activity.logged", async (event) => {
        await this.handleActivityLogged(event);
      }),
      this.bus.subscribe("tm.*.message.delivery.updated", async (event) => {
        await this.handleDeliveryUpdated(event);
      }),
    ]);

    this.unsubs.push(activityUnsub, deliveryUnsub);
    this.logger.log("Activity log listeners active");
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.unsubs.map((unsub) => unsub()));
  }

  private async handleActivityLogged(event: EventEnvelope) {
    const data = event.data as Record<string, unknown>;
    const service = stringValue(data.service);
    const action = stringValue(data.action);
    const entityType = stringValue(data.entity_type ?? data.entityType);
    const entityId = stringValue(data.entity_id ?? data.entityId);
    const summary = stringValue(data.summary);

    if (!event.tenant_id || !service || !action || !entityType || !entityId || !summary) {
      this.logger.warn("activity_log_event_invalid", JSON.stringify({ tenantId: event.tenant_id, type: event.type }));
      return;
    }

    const actor = typeof event.actor === "object" && event.actor ? event.actor as Record<string, unknown> : {};
    await this.activityLog.record({
      tenantId: event.tenant_id,
      service,
      action,
      entityType,
      entityId,
      summary,
      actorId: stringValue(actor.id),
      actorRole: stringValue(actor.role),
      metadata: normalizeMetadata(data.metadata),
      occurredAt: event.occurred_at,
    });
  }

  private async handleDeliveryUpdated(event: EventEnvelope) {
    const data = event.data as Record<string, unknown>;
    const messageId = stringValue(data.message_id ?? data.messageId);
    const status = stringValue(data.status);
    const channel = stringValue(data.channel);
    if (!event.tenant_id || !messageId || !status || !channel) {
      return;
    }

    await this.activityLog.record({
      tenantId: event.tenant_id,
      service: "notification",
      action: "message.delivery.updated",
      entityType: "message",
      entityId: messageId,
      summary: `Notification ${channel} delivery updated to ${status}`,
      metadata: normalizeMetadata(data),
      occurredAt: event.occurred_at,
    });
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}
