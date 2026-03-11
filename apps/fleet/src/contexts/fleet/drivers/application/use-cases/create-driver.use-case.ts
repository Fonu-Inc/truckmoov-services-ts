import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { Driver } from "../../domain/entities/driver.entity";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";

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
    private readonly config: AppConfigService,
  ) {}

  async execute(command: CreateDriverCommand) {
    const driver = Driver.create({
      id: randomUUID(),
      name: command.name,
      licenseNumber: command.licenseNumber,
      tenantId: command.tenantId ?? this.config.fleet.defaultTenant,
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
