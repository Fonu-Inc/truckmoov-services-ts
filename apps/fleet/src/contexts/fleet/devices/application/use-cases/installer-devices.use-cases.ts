import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { DEVICE_LIFECYCLE_LABELS, protocolNeedsPort } from "@shared/devices";
import type { Device } from "../../domain/entities/device.entity";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import {
  DEVICE_CATALOG_PORT,
  type DeviceCatalogPort,
} from "../../domain/ports/device-catalog.port";
import type { InstallerScopeEntry } from "../../domain/ports/installer-device-scope.port";
import { GetDeviceDiagnosticsUseCase } from "./get-device-diagnostics.use-case";
import { summariseDevices } from "./get-installation-queue.use-case";
import {
  GetVerificationMonitorUseCase,
  type VerificationMonitorRow,
} from "./get-verification-monitor.use-case";

type VerificationState = "not_started" | "waiting" | "failed" | "verified";

const VERIFICATION_LABELS: Record<VerificationState, string> = {
  not_started: "Not started",
  waiting: "Waiting",
  failed: "Failed",
  verified: "Verified",
};

const FAILURE_MESSAGES: Record<string, string> = {
  timeout: "No telemetry arrived before the verification window closed",
  wrong_port: "The device reported on the wrong port",
  malformed_payload: "The device sent data nothing could read",
  authentication_rejected: "The server rejected the device's connection",
  unknown: "Verification failed for an unknown reason",
};

type FailureLike = { reason: string; detail: string | null };

function toError(failure: FailureLike) {
  return { code: failure.reason, message: failure.detail ?? FAILURE_MESSAGES[failure.reason] ?? failure.reason };
}

function byTenant(scope: InstallerScopeEntry[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const entry of scope) grouped.set(entry.tenantId, [...(grouped.get(entry.tenantId) ?? []), entry.deviceId]);
  return grouped;
}

function toItem(entry: InstallerScopeEntry, device: Device, row: VerificationMonitorRow) {
  const status: VerificationState = device.verificationStatus ?? "not_started";
  return {
    deviceId: device.id,
    jobNumber: entry.jobNumber,
    name: device.name,
    manufacturer: device.manufacturer,
    model: device.model,
    imei: device.imei,
    status,
    statusLabel: VERIFICATION_LABELS[status],
    configuredAt: row.configuredAt,
    secondsSinceConfigured: row.secondsSinceConfigured,
    lastSeenAt: row.lastSeen,
    errors: row.errors.map(toError),
  };
}

/**
 * The installer's Verification and Troubleshooting tabs, over the devices auth
 * says are theirs. Each device is read in the tenant its job belongs to, and a
 * device outside the scope answers as a missing one.
 */
@Injectable()
export class InstallerDevicesUseCases {
  constructor(
    @Inject(GetVerificationMonitorUseCase) private readonly monitor: GetVerificationMonitorUseCase,
    @Inject(GetDeviceDiagnosticsUseCase) private readonly diagnostics: GetDeviceDiagnosticsUseCase,
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async verification(scope: InstallerScopeEntry[], now = new Date()) {
    const found = await this.scopedDevices(scope, now);
    const byId = new Map(found.map((hit) => [hit.device.id, hit]));
    const items = scope.flatMap((entry) => {
      const hit = byId.get(entry.deviceId);
      return hit ? [toItem(entry, hit.device, hit.row)] : [];
    });
    const summary = summariseDevices(found.map(({ device }) => device), now);

    return {
      summary: {
        awaitingSignal: summary.awaitingSignal,
        failed: summary.failedVerification,
        verifiedToday: summary.verifiedToday,
      },
      items,
    };
  }

  async diagnose(scope: InstallerScopeEntry[], deviceId: string) {
    const entry = scope.find((candidate) => candidate.deviceId === deviceId);
    if (!entry) throw new DeviceNotFoundError(deviceId);

    const result = await this.diagnostics.execute(deviceId, entry.tenantId);
    const { device } = result;
    return {
      device: {
        id: device.id,
        name: device.name,
        manufacturer: device.manufacturer,
        model: device.model,
        jobNumber: entry.jobNumber,
      },
      imei: device.imei,
      status: device.lifecycleStatus,
      statusLabel: DEVICE_LIFECYCLE_LABELS[device.lifecycleStatus],
      lastSeenAt: device.lastSeen,
      configuredAt: device.configuredAt,
      errors: result.failures.map(toError),
      expectedEndpoint: await this.expectedEndpoint(device.manufacturer, device.model),
    };
  }

  private async scopedDevices(scope: InstallerScopeEntry[], now: Date) {
    const perTenant = await Promise.all(
      [...byTenant(scope)].map(([tenantId, ids]) => this.monitor.forDevices(tenantId, ids, now)),
    );
    return perTenant.flat();
  }

  /** Where the device should report: this deployment's host, and the protocol and port its model uses. */
  private async expectedEndpoint(manufacturer: string, model: string) {
    const entry = await this.catalog.findModel(manufacturer, model);
    return {
      host: this.config.fleet.telemetryIngestHost || null,
      protocol: entry?.protocol ?? null,
      port: entry && protocolNeedsPort(entry.protocol) ? entry.defaultPort : null,
    };
  }
}
