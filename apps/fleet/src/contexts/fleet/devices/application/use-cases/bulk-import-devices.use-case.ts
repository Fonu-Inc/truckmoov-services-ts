import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { QuotaService } from "../../../../../quota.service";
import { Device } from "../../domain/entities/device.entity";
import { type DeviceCsvRow } from "../../domain/device-csv";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";
import type { CsvRowError } from "@shared/csv";

export type BulkImportDevicesCommand = {
  tenantId?: string;
  rows: DeviceCsvRow[];
  /** Rows the parser could not read. Reported back untouched so the count adds up. */
  skipped?: CsvRowError[];
};

@Injectable()
export class BulkImportDevicesUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: BulkImportDevicesCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const rows = command.rows;
    const skipped = command.skipped ?? [];

    const existing = await this.deviceRepository.findAll({ tenantId });
    const byImei = new Map(existing.map((device) => [device.imei, device]));

    // Only rows that would register a new device consume plan seats. Updating a
    // device already on the account does not, so a correction file still
    // imports on a full plan.
    const creates = rows.filter((row) => !byImei.has(row.imei)).length;
    await this.quotaService.assertRoomFor(tenantId, "devices", existing.length, creates);

    let created = 0;
    let updated = 0;
    const records: ReturnType<Device["toPrimitives"]>[] = [];

    for (const row of rows) {
      const current = byImei.get(row.imei) ?? null;
      const record = current ? applyUpdate(current, row) : this.register(row, tenantId);

      if (current) updated += 1;
      else created += 1;

      await this.deviceRepository.save(record);
      await emitDeviceIdentity(this.identityPublisher, record, current ? "updated" : "registered");
      records.push(record.toPrimitives());
    }

    return {
      created,
      updated,
      total: rows.length + skipped.length,
      skipped,
      records,
    };
  }

  private register(row: DeviceCsvRow, tenantId: string): Device {
    return Device.create({
      id: this.runtime.generateId(),
      imei: row.imei,
      name: row.name,
      manufacturer: row.manufacturer,
      model: row.model,
      firmwareVersion: row.firmwareVersion ?? "1.0.0",
      tenantId,
      lifecycleStatus: row.lifecycleStatus ?? "registered",
      vehicleId: null,
      signalStrength: null,
      batteryLevel: null,
      lastSeen: null,
      assignedAt: null,
    });
  }
}

/**
 * An import updates what the operator maintains, never where the device sits.
 * A spreadsheet must not be able to move a fitted device back to `registered`,
 * so lifecycle_status on an existing row is ignored.
 */
function applyUpdate(device: Device, row: DeviceCsvRow): Device {
  return device.update({
    name: row.name ?? device.name,
    manufacturer: row.manufacturer,
    model: row.model,
    firmwareVersion: row.firmwareVersion ?? device.firmwareVersion,
  });
}
