import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

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

  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  async execute(command: RecordDeviceTelemetryCommand): Promise<Device | null> {
    const device = await this.resolveDevice(command);
    if (!device) return null;

    if (device.verificationStatus === "waiting") {
      const verified = device.recordFirstTelemetry(command.reportedAt, command.reportedProtocol);
      await this.devices.save(verified);
      this.logger.log(`device_verified:${device.tenantId}:${device.id}`);
      return verified;
    }

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
