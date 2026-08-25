import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import type { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_VERIFICATION_FAILURE_REPOSITORY,
  type DeviceVerificationFailureRepository,
} from "../../domain/repositories/device-verification-failure.repository";
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/repositories/device.repository";

/** Named causes, so troubleshooting can group them rather than read free text. */
export const VERIFICATION_FAILURE_REASONS = [
  "timeout",
  "wrong_port",
  "malformed_payload",
  "authentication_rejected",
  "unknown",
] as const;

export type VerificationFailureReason = (typeof VERIFICATION_FAILURE_REASONS)[number];

export type RecordVerificationFailureCommand = {
  device: Device;
  reason: VerificationFailureReason;
  detail?: string | null;
  /** Exactly what arrived, unparsed. Kept even when nothing can read it. */
  rawPayload?: string | null;
  sourceAddress?: string | null;
  at?: string;
};

/**
 * Marks an attempt failed and keeps the evidence.
 *
 * The device stays configured. A tracker that reported nothing may have the
 * wrong port programmed, and that is fixed by configuring it again, not by
 * writing it off as faulty.
 */
@Injectable()
export class RecordVerificationFailureUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DEVICE_VERIFICATION_FAILURE_REPOSITORY)
    private readonly failures: DeviceVerificationFailureRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: RecordVerificationFailureCommand): Promise<Device> {
    const at = command.at ?? new Date().toISOString();
    const failed = command.device.failVerification(command.reason, at);
    await this.devices.save(failed);

    await this.failures.append({
      id: this.runtime.generateId(),
      tenantId: failed.tenantId,
      deviceId: failed.id,
      imei: failed.imei,
      reason: command.reason,
      detail: command.detail ?? null,
      rawPayload: command.rawPayload ?? null,
      sourceAddress: command.sourceAddress ?? null,
      createdAt: at,
    });

    return failed;
  }
}
