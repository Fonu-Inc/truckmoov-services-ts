import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Driver } from "../../domain/entities/driver.entity";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

export type CreateDriverCommand = {
  name: string;
  licenseNumber: string;
  tenantId?: string;
};

@Injectable()
export class CreateDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(command: CreateDriverCommand) {
    const driver = Driver.create({
      id: randomUUID(),
      name: command.name,
      licenseNumber: command.licenseNumber,
      tenantId: command.tenantId ?? process.env.DEFAULT_TENANT ?? "default",
    });

    await this.driverRepository.save(driver);
    return driver.toPrimitives();
  }
}
