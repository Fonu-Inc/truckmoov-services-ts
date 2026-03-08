import { Inject, Injectable } from "@nestjs/common";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

@Injectable()
export class ListDriversUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute() {
    const drivers = await this.driverRepository.findAll();
    return drivers.map((driver) => driver.toPrimitives());
  }
}
