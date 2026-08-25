import { Inject, Injectable } from "@nestjs/common";
import { ConfigureDeviceUseCase } from "./configure-device.use-case";

/** One request cannot configure more than this. Keeps a batch bounded. */
export const BULK_CONFIGURE_LIMIT = 200;

export type BulkConfigureDevicesCommand = {
  tenantId: string;
  deviceIds: string[];
  port?: number | null;
};

export type BulkConfigureResult = {
  configured: string[];
  failed: Array<{ deviceId: string; reason: string }>;
};

/**
 * Configures a batch of devices.
 *
 * A shipment arrives as many units of the same model, and configuring them one
 * at a time is the work this screen exists to remove. One device failing does
 * not stop the rest: an installer fitting twenty trackers should not lose
 * nineteen because one was already assigned.
 */
@Injectable()
export class BulkConfigureDevicesUseCase {
  constructor(
    @Inject(ConfigureDeviceUseCase) private readonly configure: ConfigureDeviceUseCase,
  ) {}

  async execute(command: BulkConfigureDevicesCommand): Promise<BulkConfigureResult> {
    const deviceIds = [...new Set(command.deviceIds)].slice(0, BULK_CONFIGURE_LIMIT);
    const result: BulkConfigureResult = { configured: [], failed: [] };

    for (const deviceId of deviceIds) {
      try {
        await this.configure.execute({
          tenantId: command.tenantId,
          deviceId,
          port: command.port,
        });
        result.configured.push(deviceId);
      } catch (error) {
        result.failed.push({
          deviceId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return result;
  }
}
