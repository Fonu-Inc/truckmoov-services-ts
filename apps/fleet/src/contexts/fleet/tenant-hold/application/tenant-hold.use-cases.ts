import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../devices/domain/ports/device-identity-event.publisher";
import {
  TENANT_HOLD_REPOSITORY,
  type DeviceChunkHandler,
  type FleetHoldCause,
  type HeldDevice,
  type HoldCounts,
  type TenantHoldRepository,
} from "../domain/tenant-hold.repository";

export type TenantHoldRequestCause = "manual" | "non_payment";

const holdCauseOf = (cause: TenantHoldRequestCause): FleetHoldCause =>
  cause === "manual" ? "tenant_manual" : "non_payment";

const releaseCausesOf = (cause: TenantHoldRequestCause): FleetHoldCause[] =>
  cause === "manual" ? ["non_payment", "tenant_manual"] : ["non_payment"];

@Injectable()
export class TenantHoldUseCases {
  private readonly logger = new Logger(TenantHoldUseCases.name);

  constructor(
    @Inject(TENANT_HOLD_REPOSITORY) private readonly holds: TenantHoldRepository,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER) private readonly identity: DeviceIdentityEventPublisher,
  ) {}

  async suspend(tenantId: string, cause: TenantHoldRequestCause, reason: string): Promise<HoldCounts> {
    const announce = this.announcer();
    if (cause === "manual") await this.holds.retag(tenantId, "non_payment", "tenant_manual", announce);
    return this.holds.hold(tenantId, holdCauseOf(cause), reason, announce);
  }

  async reinstate(tenantId: string, cause: TenantHoldRequestCause): Promise<HoldCounts> {
    return this.holds.release(tenantId, releaseCausesOf(cause), this.announcer());
  }

  preview(tenantIds: string[]) {
    return this.holds.preview(tenantIds);
  }

  async heldDevices(limit: number, cursor: string | null) {
    const devices = await this.holds.listHeldDevices(limit, cursor);
    const last = devices.length === limit ? devices[devices.length - 1] : undefined;
    return {
      devices: devices.map((device) => ({
        deviceId: device.id,
        imei: device.imei,
        tenantId: device.tenantId,
        cause: device.cause,
      })),
      nextCursor: last?.id ?? null,
    };
  }

  private announcer(): DeviceChunkHandler {
    return async (devices) => {
      await Promise.all(devices.map((device) => this.announce(device)));
    };
  }

  // A broker outage must not undo a hold that is already written; tracking
  // heals from its periodic snapshot.
  private async announce(device: HeldDevice): Promise<void> {
    try {
      await this.identity.publish({
        tenant_id: device.tenantId,
        device_id: device.id,
        imei: device.imei,
        manufacturer: device.manufacturer,
        model: device.model,
        vehicle_id: device.vehicleId,
        action: "updated",
        suspended: device.cause !== null,
        suspension_cause: device.cause,
      });
    } catch (error) {
      this.logger.warn(`device_hold_event_failed:${device.id}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }
}
