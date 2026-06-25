import { Inject, Injectable } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import type {
  DeviceIdentityChangedEvent,
  DeviceIdentityEventPublisher,
} from "../domain/ports/device-identity-event.publisher";

@Injectable()
export class EventBusDeviceIdentityEventPublisher implements DeviceIdentityEventPublisher {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async publish(event: DeviceIdentityChangedEvent): Promise<void> {
    // Subject convention is centralized here so use-cases stay broker-agnostic.
    const subject = `tm.${event.tenant_id}.device.identity.changed`;
    await this.eventBus.publish(subject, {
      id: this.runtime.generateId(),
      type: "device.identity.changed",
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: event.tenant_id,
      data: {
        device_id: event.device_id,
        imei: event.imei,
        manufacturer: event.manufacturer,
        model: event.model,
        vehicle_id: event.vehicle_id,
        action: event.action,
      },
    });
  }
}
