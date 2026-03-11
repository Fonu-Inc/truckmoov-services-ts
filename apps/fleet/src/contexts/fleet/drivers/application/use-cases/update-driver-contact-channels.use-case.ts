import { Inject, Injectable } from "@nestjs/common";
import type { DriverContactChannels } from "../../domain/entities/driver.entity";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

export type UpdateDriverContactChannelsCommand = {
  id: string;
  channels: Partial<DriverContactChannels>;
};

@Injectable()
export class UpdateDriverContactChannelsUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(command: UpdateDriverContactChannelsCommand) {
    const driver = await this.driverRepository.findById(command.id);
    if (!driver) {
      throw new DriverNotFoundError(command.id);
    }

    const updatedDriver = driver.updateContactChannels(command.channels);
    await this.driverRepository.save(updatedDriver);
    return updatedDriver.toPrimitives();
  }
}
