import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { Device, type DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

export type CreateDeviceCommand = {
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  tenantId?: string;
  lifecycleStatus?: DeviceLifecycleStatus;
};

@Injectable()
export class CreateDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: CreateDeviceCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const existing = await this.deviceRepository.findByImei(command.imei, tenantId);
    if (existing) {
      throw new FleetRuleError(`device with IMEI ${command.imei} already exists`);
    }

    const device = Device.create({
      id: this.runtime.generateId(),
      imei: command.imei,
      manufacturer: command.manufacturer,
      model: command.model,
      firmwareVersion: command.firmwareVersion,
      tenantId,
      // New inventory devices always start at the beginning of the installer workflow unless explicitly seeded.
      lifecycleStatus: command.lifecycleStatus ?? "registered",
      vehicleId: null,
      signalStrength: null,
      batteryLevel: null,
      lastSeen: null,
      assignedAt: null,
    });

    await this.deviceRepository.save(device);
    return device.toPrimitives();
  }
}
