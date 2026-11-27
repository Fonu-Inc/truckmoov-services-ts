import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";
import {
  DEVICE_VERIFICATION_EVENT_PUBLISHER,
  type DeviceVerificationEventPublisher,
} from "../../domain/ports/device-verification-event.publisher";

/** A verified device's lastSeen is only rewritten when it moves by at least this much. */
export const LAST_SEEN_DEBOUNCE_MS = 30_000;

export type RecordDeviceTelemetryCommand = {
  tenantId: string;
  deviceId?: string | null;
  imei?: string | null;
  reportedAt: string;
  /** The wire-protocol/vendor identity the ingest adapter actually observed, when it reported one. */
  reportedProtocol?: string | null;
};

/**
 * The moment a device is heard from.
 *
 * This is the only path to verified_online. A person marking a device verified
 * proves nothing about whether the tracker is on the network; a packet from
 * that tracker does. Telemetry from an already-verified device is an ordinary
 * position update and only moves lastSeen.
 */
@Injectable()
export class RecordDeviceTelemetryUseCase {
  private readonly logger = new Logger(RecordDeviceTelemetryUseCase.name);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_VERIFICATION_EVENT_PUBLISHER) private readonly events: DeviceVerificationEventPublisher,
  ) {}

  async execute(command: RecordDeviceTelemetryCommand): Promise<Device | null> {
    const device = await this.resolveDevice(command);
    if (!device) return null;

    if (device.verificationStatus === "waiting") {
      const verified = await this.verify(device, command);
      if (verified) return verified;
      const settled = await this.resolveDevice(command);
      return settled ? this.touch(settled, command) : null;
    }

    return this.touch(device, command);
  }

  private async verify(device: Device, command: RecordDeviceTelemetryCommand): Promise<Device | null> {
    const verified = device.recordFirstTelemetry(command.reportedAt, command.reportedProtocol);
    if (!(await this.devices.saveIfWaitingForVerification(verified))) return null;
    this.logger.log(`device_verified:${device.tenantId}:${device.id}`);
    await this.events.verified(verified, command.reportedAt);
    return verified;
  }

  private async touch(device: Device, command: RecordDeviceTelemetryCommand): Promise<Device> {
    if (isDebounced(device, command)) return device;
    const touched = device.update({
      lastSeen: command.reportedAt,
      reportedProtocol: command.reportedProtocol,
    });
    await this.devices.save(touched);
    return touched;
  }

  private async resolveDevice(command: RecordDeviceTelemetryCommand): Promise<Device | null> {
    if (command.deviceId?.trim()) {
      const byId = await this.devices.findById(command.deviceId.trim(), command.tenantId);
      if (byId) return byId;
    }
    if (command.imei?.trim()) {
      return this.devices.findByImei(command.imei.trim(), command.tenantId);
    }
    return null;
  }
}

function isDebounced(device: Device, command: RecordDeviceTelemetryCommand): boolean {
  if (device.verificationStatus !== "verified" || !device.lastSeen) return false;
  if (command.reportedProtocol && command.reportedProtocol !== device.reportedProtocol) return false;
  const moved = Date.parse(command.reportedAt) - Date.parse(device.lastSeen);
  return moved < LAST_SEEN_DEBOUNCE_MS;
}
