import { Inject, Injectable } from "@nestjs/common";
import { DriverNotFoundError } from "../../domain/errors/driver-not-found.error";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";
import type {
  DriverCommunicationPreference,
  DriverStatusInput,
} from "../../domain/entities/driver.entity";
import { normalizeDriverStatus } from "../../domain/entities/driver.entity";
import {
  buildPreferredContactChannelUpdate,
  composeDriverName,
} from "../support/driver-input";

export type UpdateDriverCommand = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string | null;
  licenseNumber?: string;
  licenseExpiryDate?: string | null;
  tenantId?: string;
  status?: DriverStatusInput;
  communicationPreference?: DriverCommunicationPreference;
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

    const shouldRebuildName =
      command.name !== undefined
      || command.firstName !== undefined
      || command.lastName !== undefined;

    const updatedDriver = existingDriver
      .update({
        // Preserve the legacy full-name field internally while accepting the UI's split-name payload.
        name: shouldRebuildName ? composeDriverName(command) : undefined,
        phone: command.phone,
        email: command.email,
        licenseNumber: command.licenseNumber,
        licenseExpiryDate: command.licenseExpiryDate,
        tenantId: command.tenantId,
        status: normalizeDriverStatus(command.status),
        communicationPreference: command.communicationPreference,
      })
      .updateContactChannels(
        buildPreferredContactChannelUpdate({
          phone: command.phone,
          communicationPreference:
            command.communicationPreference ?? existingDriver.communicationPreference,
        }),
      );

    await this.driverRepository.save(updatedDriver);
    return updatedDriver.toPrimitives();
  }
}
