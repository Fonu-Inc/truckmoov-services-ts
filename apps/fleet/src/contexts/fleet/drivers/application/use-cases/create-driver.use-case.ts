import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { Driver } from "../../domain/entities/driver.entity";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";

export type CreateDriverCommand = {
  name: string;
  licenseNumber: string;
  tenantId?: string;
  status?: FleetAssetStatus;
};

@Injectable()
export class CreateDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: CreateDriverCommand) {
    const driver = Driver.create({
      id: this.runtime.generateId(),
      name: command.name,
      licenseNumber: command.licenseNumber,
      tenantId: command.tenantId ?? this.runtime.getDefaultTenantId(),
      status: command.status ?? "active",
      assignedVehicleId: null,
      contactChannels: {
        whatsappNumber: null,
        smsNumber: null,
        voiceNumber: null,
      },
    });

    await this.driverRepository.save(driver);
    return driver.toPrimitives();
  }
}
