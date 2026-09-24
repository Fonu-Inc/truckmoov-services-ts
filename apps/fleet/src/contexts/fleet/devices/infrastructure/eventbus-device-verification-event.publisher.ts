import { Inject, Injectable, Logger } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import type { Device } from "../domain/entities/device.entity";
import type {
  DeviceVerificationEventPublisher,
  VerificationFailureNotice,
} from "../domain/ports/device-verification-event.publisher";

@Injectable()
export class EventBusDeviceVerificationEventPublisher implements DeviceVerificationEventPublisher {
  private readonly logger = new Logger(EventBusDeviceVerificationEventPublisher.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  verified(device: Device, at: string): Promise<void> {
    return this.publish("verified", device, at, {});
  }

  failed(device: Device, failure: VerificationFailureNotice, at: string): Promise<void> {
    return this.publish("failed", device, at, { reason_code: failure.code, reason_message: failure.message });
  }

  private async publish(
    outcome: "verified" | "failed",
    device: Device,
    at: string,
    extra: Record<string, string>,
  ): Promise<void> {
    const type = `device.verification.${outcome}`;
    try {
      await this.eventBus.publish(`tm.${device.tenantId}.${type}`, {
        id: this.runtime.generateId(),
        type,
        version: 1,
        occurred_at: at,
        tenant_id: device.tenantId,
        data: {
          device_id: device.id,
          imei: device.imei,
          manufacturer: device.manufacturer,
          model: device.model,
          occurred_at: at,
          ...extra,
        },
      });
    } catch (error) {
      this.logger.warn(`device_verification_publish_failed:${device.tenantId}:${device.id}:${(error as Error).message}`);
    }
  }
}
