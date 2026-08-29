import { Inject, Injectable } from "@nestjs/common";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_VERIFICATION_FAILURE_REPOSITORY,
  type DeviceVerificationFailureRepository,
} from "../../domain/repositories/device-verification-failure.repository";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

/** Enough history to see whether a device fails the same way every time. */
const FAILURE_HISTORY_LIMIT = 20;

/**
 * Per-device troubleshooting.
 *
 * Returns what was programmed into the device alongside what it has actually
 * sent. The usual fault is a mismatch between the two, and it is only visible
 * with both in one place.
 */
@Injectable()
export class GetDeviceDiagnosticsUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_VERIFICATION_FAILURE_REPOSITORY)
    private readonly failures: DeviceVerificationFailureRepository,
  ) {}

  async execute(deviceId: string, tenantId: string) {
    const device = await this.devices.findById(deviceId, tenantId);
    if (!device) throw new DeviceNotFoundError(deviceId);

    const history = await this.failures.findByDevice(
      deviceId,
      tenantId,
      FAILURE_HISTORY_LIMIT,
    );

    return {
      device: {
        id: device.id,
        imei: device.imei,
        manufacturer: device.manufacturer,
        model: device.model,
        firmwareVersion: device.firmwareVersion,
        lifecycleStatus: device.lifecycleStatus,
        verificationStatus: device.verificationStatus,
        verificationError: device.verificationError,
        verificationDeadline: device.verificationDeadline,
        configuredAt: device.configuredAt,
        verifiedAt: device.verifiedAt,
        lastSeen: device.lastSeen,
        signalStrength: device.signalStrength,
        batteryLevel: device.batteryLevel,
      },
      configuredWith: {
        protocol: device.protocol,
        port: device.port,
      },
      reportedWith: {
        protocol: device.reportedProtocol,
      },
      nextAction: device.nextAction,
      failures: history,
    };
  }
}
