import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

export type UpdateDriverCommand = {
  id: string;
  name?: string;
  licenseNumber?: string;
  tenantId?: string;
};

@Injectable()
export class UpdateDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(command: UpdateDriverCommand) {
    const existingDriver = await this.driverRepository.findById(command.id);
    if (!existingDriver) {
      throw new DriverNotFoundError(command.id);
    }

    const updatedDriver = existingDriver.update({
      name: command.name,
      licenseNumber: command.licenseNumber,
      tenantId: command.tenantId,
    });

    await this.driverRepository.save(updatedDriver);
    return updatedDriver.toPrimitives();
  }
}
