import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

@Injectable()
export class GetDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(id: string) {
    const driver = await this.driverRepository.findById(id);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }

    return driver.toPrimitives();
  }
}
