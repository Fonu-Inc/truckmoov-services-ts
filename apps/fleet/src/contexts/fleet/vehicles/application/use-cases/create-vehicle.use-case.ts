import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../domain/repositories/vehicle.repository";
import { Vehicle } from "../../domain/entities/vehicle.entity";

export type CreateVehicleCommand = {
  plateNumber: string;
  model: string;
  tenantId?: string;
};

@Injectable()
export class CreateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepository: VehicleRepository,
    private readonly config: AppConfigService,
  ) {}

  async execute(command: CreateVehicleCommand) {
    const vehicle = Vehicle.create({
      id: randomUUID(),
      plateNumber: command.plateNumber,
      model: command.model,
      tenantId: command.tenantId ?? this.config.fleet.defaultTenant,
    });

    await this.vehicleRepository.save(vehicle);
    return vehicle.toPrimitives();
  }
}
