import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import { CreateVehicleUseCase } from "../../../vehicles/application/use-cases/create-vehicle.use-case";
import type { FleetVehicleType } from "../../../vehicles/domain/entities/vehicle.entity";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../../vehicles/domain/repositories/vehicle.repository";
import type { Device } from "../../domain/entities/device.entity";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import { AssignDeviceToVehicleUseCase } from "./assign-device-to-vehicle.use-case";
import { StartDeviceVerificationUseCase } from "./start-device-verification.use-case";

export type VerificationStartOutcome = "started" | "skipped" | "refused" | "missing";

export type VerificationStart = { deviceId: string; outcome: VerificationStartOutcome; reason?: string };

export type OnboardedVehicle = {
  registrationNumber: string;
  vehicleType?: string | null;
  make?: string | null;
  model: string;
  year?: number | null;
  chassisNumber?: string | null;
};

const FLEET_VEHICLE_TYPES: readonly FleetVehicleType[] = ["truck", "van", "trailer"];
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

function vehicleType(value?: string | null): FleetVehicleType | undefined {
  return FLEET_VEHICLE_TYPES.find((type) => type === value);
}

/** Onboarding accepts values fleet does not; those are left out rather than failing the handover. */
function fleetYear(year?: number | null): number | undefined {
  const latest = new Date().getFullYear() + 1;
  return year && Number.isInteger(year) && year >= 1990 && year <= latest ? year : undefined;
}

function alreadyVerifying(device: Device): boolean {
  return device.verificationStatus === "waiting" || device.verificationStatus === "verified";
}

@Injectable()
export class InstallationHandoverUseCases {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(StartDeviceVerificationUseCase) private readonly startVerification: StartDeviceVerificationUseCase,
    @Inject(CreateVehicleUseCase) private readonly createVehicle: CreateVehicleUseCase,
    @Inject(AssignDeviceToVehicleUseCase) private readonly assignDevice: AssignDeviceToVehicleUseCase,
  ) {}

  async beginVerification(tenantId: string, deviceIds: string[]): Promise<VerificationStart[]> {
    const found = new Map((await this.devices.findByIds(tenantId, deviceIds)).map((device) => [device.id, device]));
    const results: VerificationStart[] = [];
    for (const deviceId of deviceIds) results.push(await this.beginOne(tenantId, deviceId, found.get(deviceId)));
    return results;
  }

  /** Idempotent: one vehicle per registration, and a device already on it stays. */
  async handOver(tenantId: string, unit: { deviceId: string; vehicle: OnboardedVehicle }) {
    const vehicleId = await this.vehicleFor(tenantId, unit.vehicle);
    const device = await this.assignDevice.execute({ tenantId, deviceId: unit.deviceId, vehicleId });
    return { vehicleId, deviceId: device.id, lifecycleStatus: device.lifecycleStatus };
  }

  private async beginOne(tenantId: string, deviceId: string, device?: Device): Promise<VerificationStart> {
    if (!device) return { deviceId, outcome: "missing" };
    if (alreadyVerifying(device)) return { deviceId, outcome: "skipped" };
    try {
      await this.startVerification.execute({ tenantId, deviceId });
      return { deviceId, outcome: "started" };
    } catch (error) {
      if (error instanceof FleetRuleError) return { deviceId, outcome: "refused", reason: error.message };
      throw error;
    }
  }

  private async vehicleFor(tenantId: string, vehicle: OnboardedVehicle): Promise<string> {
    const existing = await this.vehicles.findByPlateNumber(vehicle.registrationNumber, tenantId);
    if (existing) return existing.id;
    const chassis = vehicle.chassisNumber?.trim();
    const created = await this.createVehicle.execute({
      tenantId,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make?.trim() || undefined,
      model: vehicle.model,
      year: fleetYear(vehicle.year),
      type: vehicleType(vehicle.vehicleType),
      vin: chassis && VIN.test(chassis) ? chassis : undefined,
    });
    return created.id;
  }
}
