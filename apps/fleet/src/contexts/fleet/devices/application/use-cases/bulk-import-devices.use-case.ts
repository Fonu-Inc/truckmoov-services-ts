import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import type { DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { Device } from "../../domain/entities/device.entity";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";

export type DeviceImportItem = {
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  lifecycleStatus?: DeviceLifecycleStatus;
};

export type BulkImportDevicesCommand = {
  tenantId?: string;
  items: DeviceImportItem[];
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
  ) {}

  async execute(command: BulkImportDevicesCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    let created = 0;
    let updated = 0;
    const records: ReturnType<Device["toPrimitives"]>[] = [];

    for (const item of command.items) {
      const existing = await this.deviceRepository.findByImei(item.imei, tenantId);
      const record = existing
        ? existing.update({
            manufacturer: item.manufacturer,
            model: item.model,
            firmwareVersion: item.firmwareVersion ?? existing.firmwareVersion,
          })
        : Device.create({
            id: this.runtime.generateId(),
            imei: item.imei,
            manufacturer: item.manufacturer,
            model: item.model,
            firmwareVersion: item.firmwareVersion ?? "1.0.0",
            tenantId,
            lifecycleStatus: item.lifecycleStatus ?? "registered",
            vehicleId: null,
            signalStrength: null,
            batteryLevel: null,
            lastSeen: null,
            assignedAt: null,
          });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }

      await this.deviceRepository.save(record);
      await emitDeviceIdentity(this.identityPublisher, record, existing ? "updated" : "registered");
      records.push(record.toPrimitives());
    }

    return {
      created,
      updated,
      total: command.items.length,
      records,
    };
  }
}
