import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

@Injectable()
export class DeleteDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(id: string) {
    const existingDriver = await this.driverRepository.findById(id);
    if (!existingDriver) {
      throw new DriverNotFoundError(id);
    }

    await this.driverRepository.deleteById(id);
    return { deleted: true, id };
  }
}
