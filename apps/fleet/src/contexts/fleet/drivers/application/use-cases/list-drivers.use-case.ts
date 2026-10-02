import { Inject, Injectable } from "@nestjs/common";
import {
  DRIVER_REPOSITORY,
  type DriverFilters,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

@Injectable()
export class ListDriversUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(filters: DriverFilters) {
    const drivers = await this.driverRepository.findAll(filters);
    return drivers.map((driver) => driver.toPrimitives());
  }
}
