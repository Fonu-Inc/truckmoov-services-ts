import { Inject, Injectable } from "@nestjs/common";
import { protocolNeedsPort } from "@shared/devices";
import type { Device, DeviceProtocol } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DeviceConfigurationError,
  DeviceModelNotInCatalogError,
} from "../../domain/errors/device-installation.errors";
import {
  DEVICE_CATALOG_PORT,
  type DeviceCatalogPort,
} from "../../domain/ports/device-catalog.port";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

export type ConfigureDeviceCommand = {
  tenantId: string;
  deviceId: string;
  /** Overrides the catalogue port. Used when a model is fitted on a second listener. */
  port?: number | null;
};

/**
 * Records that a device was programmed, and with what.
 *
 * The protocol is never taken from the caller. It is a property of the device
 * model and lives in the catalogue: a tracker programmed with a protocol its
 * firmware does not speak reports nothing, and the screen showing "Never" is
 * the only symptom.
 */
@Injectable()
export class ConfigureDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
  ) {}

  async execute(command: ConfigureDeviceCommand): Promise<Device> {
    const device = await this.devices.findById(command.deviceId, command.tenantId);
    if (!device) throw new DeviceNotFoundError(command.deviceId);

    const settings = await this.resolveSettings(device, command.port);
    const configured = device.configure(settings);
    await this.devices.save(configured);
    return configured;
  }

  private async resolveSettings(
    device: Device,
    overridePort: number | null | undefined,
  ): Promise<{ protocol: DeviceProtocol; port: number | null }> {
    const entry = await this.catalog.findModel(device.manufacturer, device.model);
    if (!entry) {
      throw new DeviceModelNotInCatalogError(device.manufacturer, device.model);
    }
    if (entry.status === "blocked") {
      throw new DeviceConfigurationError(
        `${entry.manufacturer} ${entry.model} is blocked and must not be installed`,
      );
    }

    const port = overridePort === undefined ? entry.defaultPort : overridePort;
    if (protocolNeedsPort(entry.protocol) && port === null) {
      throw new DeviceConfigurationError(
        `${entry.manufacturer} ${entry.model} needs a port and the catalogue has none`,
      );
    }

    return { protocol: entry.protocol, port };
  }
}
