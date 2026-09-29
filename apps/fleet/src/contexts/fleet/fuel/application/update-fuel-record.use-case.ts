import { Inject, Injectable } from "@nestjs/common";
import { FUEL_RECORD_REPOSITORY, type FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FuelRecordNotFoundError } from "../domain/errors/fuel-record-not-found.error";
import type { FuelRecordProps } from "../domain/entities/fuel-record.entity";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import { VehicleNotFoundError } from "../../vehicles";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";

type FuelRecordChanges = Partial<
  Pick<FuelRecordProps, "liters" | "pricePerLiter" | "station" | "odometer" | "vehicleId" | "driverId" | "vehicleType" | "fuelType">
>;

const CHANGEABLE_FIELDS = [
  "liters",
  "pricePerLiter",
  "station",
  "odometer",
  "vehicleId",
  "driverId",
  "vehicleType",
  "fuelType",
] as const;

export type UpdateFuelRecordCommand = {
  id: string;
  tenantId: string;
  updatedBy: string;
  liters?: number;
  pricePerLiter?: number;
  station?: string | null;
  odometer?: number | null;
  vehicleId?: string;
  driverId?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
};

// An absent field means "leave it": spreading an undefined key would overwrite
// the stored value with undefined.
function definedChanges(cmd: UpdateFuelRecordCommand): FuelRecordChanges {
  const changes: Record<string, unknown> = {};
  for (const key of CHANGEABLE_FIELDS) {
    if (cmd[key] !== undefined) changes[key] = cmd[key];
  }
  return changes as FuelRecordChanges;
}

@Injectable()
export class UpdateFuelRecordUseCase {
  constructor(
    @Inject(FUEL_RECORD_REPOSITORY) private readonly repo: FuelRecordRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
  ) {}

  async execute(cmd: UpdateFuelRecordCommand) {
    const record = await this.repo.findById(cmd.id, cmd.tenantId);
    if (!record) throw new FuelRecordNotFoundError(cmd.id);

    if (cmd.vehicleId && cmd.vehicleId !== record.vehicleId) {
      const vehicle = await this.vehicleRepo.findById(cmd.vehicleId, cmd.tenantId);
      if (!vehicle) throw new VehicleNotFoundError(cmd.vehicleId);
    }

    const updated = record.update(definedChanges(cmd), cmd.updatedBy);

    await this.repo.save(updated);

    const [vehicle, driver] = await Promise.all([
      this.vehicleRepo.findById(updated.vehicleId, cmd.tenantId),
      updated.driverId ? this.driverRepo.findById(updated.driverId, cmd.tenantId) : Promise.resolve(null),
    ]);

    return {
      ...updated.toPrimitives(),
      vehiclePlateNumber: vehicle?.plateNumber ?? null,
      driverName: driver?.name ?? null,
    };
  }
}
