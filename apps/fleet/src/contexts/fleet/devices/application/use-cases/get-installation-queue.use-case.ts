import { Inject, Injectable } from "@nestjs/common";
import { DEVICE_INSTALLATION_QUEUE_STATUSES } from "@shared/devices";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

export type InstallationQueueRow = {
  id: string;
  manufacturer: string;
  model: string;
  imei: string;
  protocol: string | null;
  port: number | null;
  lifecycleStatus: string;
  verificationStatus: string | null;
  lastSeen: string | null;
  configuredAt: string | null;
  nextAction: string;
  nextActionLabel: string;
};

export type InstallationSummary = {
  awaitingSignal: number;
  failedVerification: number;
  verifiedToday: number;
};

/**
 * The installer's work queue.
 *
 * Next Action is derived here rather than in the browser. The mapping from a
 * device's state to the button an installer should press is a workflow rule,
 * and a copy of it in the frontend is a copy that drifts.
 */
@Injectable()
export class GetInstallationQueueUseCase {
  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  async execute(tenantId: string, now = new Date()) {
    const queue = await this.devices.findAll({
      tenantId,
      lifecycleStatusIn: [...DEVICE_INSTALLATION_QUEUE_STATUSES],
    });

    return {
      summary: await this.summarise(tenantId, now),
      queue: queue.map((device) => toQueueRow(device)),
    };
  }

  private async summarise(tenantId: string, now: Date): Promise<InstallationSummary> {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [waiting, failed, verifiedToday] = await Promise.all([
      this.devices.findAll({ tenantId, verificationStatus: "waiting" }),
      this.devices.findAll({ tenantId, verificationStatus: "failed" }),
      this.devices.findAll({
        tenantId,
        verificationStatus: "verified",
        verifiedAfter: startOfDay,
      }),
    ]);

    return {
      awaitingSignal: waiting.length,
      failedVerification: failed.length,
      verifiedToday: verifiedToday.length,
    };
  }
}

export function toQueueRow(device: Device): InstallationQueueRow {
  const nextAction = device.nextAction;
  return {
    id: device.id,
    manufacturer: device.manufacturer,
    model: device.model,
    imei: device.imei,
    protocol: device.protocol,
    port: device.port,
    lifecycleStatus: device.lifecycleStatus,
    verificationStatus: device.verificationStatus,
    lastSeen: device.lastSeen,
    configuredAt: device.configuredAt,
    nextAction: nextAction.action,
    nextActionLabel: nextAction.label,
  };
}
