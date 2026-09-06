import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { Device, type DeviceLifecycleStatus } from "../../domain/entities/device.entity";
import {
  DEVICE_IDENTITY_EVENT_PUBLISHER,
  type DeviceIdentityEventPublisher,
} from "../../domain/ports/device-identity-event.publisher";
import {
  TRACCAR_DEVICE_PROVISIONER,
  type TraccarDeviceProvisioner,
} from "../../domain/ports/traccar-device.port";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { emitDeviceIdentity } from "./device-identity-emit";
import { QuotaService } from "../../../../../quota.service";

export type CreateDeviceCommand = {
  imei: string;
  name?: string | null;
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
    @Inject(TRACCAR_DEVICE_PROVISIONER)
    private readonly traccar: TraccarDeviceProvisioner,
    @Inject(DEVICE_IDENTITY_EVENT_PUBLISHER)
    private readonly identityPublisher: DeviceIdentityEventPublisher,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: CreateDeviceCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const existing = await this.deviceRepository.findByImei(command.imei, tenantId);
    if (existing) {
      throw new FleetRuleError(`device with IMEI ${command.imei} already exists`);
    }

    // Checked after the duplicate test: re-registering a device the tenant
    // already has is a different failure from being out of device seats.
    const owned = await this.deviceRepository.findAll({ tenantId });
    await this.quotaService.assertWithinQuota(tenantId, "devices", owned.length);

    const device = Device.create({
      id: this.runtime.generateId(),
      imei: command.imei,
      name: command.name ?? null,
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
    await emitDeviceIdentity(this.identityPublisher, device, "registered");
    const provisioned = await this.provisionIntoTraccar(device);
    return provisioned.toPrimitives();
  }

  // Traccar registration is best-effort: an unreachable Traccar must not block
  // device creation. Provision status records the outcome for later reconcile.
  private async provisionIntoTraccar(device: Device): Promise<Device> {
    try {
      const result = await this.traccar.register({
        imei: device.imei,
        name: `${device.manufacturer} ${device.model} (${device.imei})`,
      });
      if (!result) {
        return device;
      }
      const registered = device.withProvisioning({
        traccarDeviceId: result.traccarDeviceId,
        provisionStatus: "registered",
      });
      await this.deviceRepository.save(registered);
      return registered;
    } catch {
      const failed = device.withProvisioning({ provisionStatus: "failed" });
      await this.deviceRepository.save(failed);
      return failed;
    }
  }
}
