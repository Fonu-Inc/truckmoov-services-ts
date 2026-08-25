import { Inject, Injectable } from "@nestjs/common";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_VERIFICATION_FAILURE_REPOSITORY,
  type DeviceVerificationFailureRepository,
} from "../../domain/repositories/device-verification-failure.repository";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

/** How many past failures a monitor row carries. Enough to see a pattern. */
const FAILURES_PER_DEVICE = 3;

export type VerificationMonitorRow = {
  id: string;
  manufacturer: string;
  model: string;
  imei: string;
  verificationStatus: string | null;
  configuredAt: string | null;
  /**
   * Seconds since the device was configured, or null when it never was. The
   * screen shows "Unknown" for null; it is a missing timestamp, not a zero.
   */
  secondsSinceConfigured: number | null;
  verificationDeadline: string | null;
  lastSeen: string | null;
  errors: Array<{ reason: string; detail: string | null; at: string }>;
};

/**
 * Devices between being configured and being trusted.
 *
 * A device with no telemetry at all shows lastSeen null, which the screen
 * renders as "Never". That is the case worth seeing: it means the tracker has
 * not reported once, so the fault is in the fitting or the settings, not in
 * the link dropping.
 */
@Injectable()
export class GetVerificationMonitorUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_VERIFICATION_FAILURE_REPOSITORY)
    private readonly failures: DeviceVerificationFailureRepository,
  ) {}

  async execute(tenantId: string, now = new Date()): Promise<VerificationMonitorRow[]> {
    const [waiting, failed] = await Promise.all([
      this.devices.findAll({ tenantId, verificationStatus: "waiting" }),
      this.devices.findAll({ tenantId, verificationStatus: "failed" }),
    ]);

    return Promise.all(
      [...waiting, ...failed].map((device) => this.toRow(device, tenantId, now)),
    );
  }

  private async toRow(
    device: Device,
    tenantId: string,
    now: Date,
  ): Promise<VerificationMonitorRow> {
    const errors =
      device.verificationStatus === "failed"
        ? await this.failures.findByDevice(device.id, tenantId, FAILURES_PER_DEVICE)
        : [];

    return {
      id: device.id,
      manufacturer: device.manufacturer,
      model: device.model,
      imei: device.imei,
      verificationStatus: device.verificationStatus,
      configuredAt: device.configuredAt,
      secondsSinceConfigured: secondsSince(device.configuredAt, now),
      verificationDeadline: device.verificationDeadline,
      lastSeen: device.lastSeen,
      errors: errors.map((entry) => ({
        reason: entry.reason,
        detail: entry.detail,
        at: entry.createdAt,
      })),
    };
  }
}

function secondsSince(timestamp: string | null, now: Date): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
}
