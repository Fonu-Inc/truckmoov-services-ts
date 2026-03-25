import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import {
  Driver,
  type DriverCommunicationPreference,
  type DriverContactChannels,
  type DriverStatusInput,
  normalizeDriverStatus,
} from "../../domain/entities/driver.entity";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";
import {
  buildPreferredContactChannelUpdate,
  composeDriverName,
} from "../support/driver-input";

export type BulkImportDriverItem = {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  licenseNumber: string;
  licenseExpiryDate?: string | null;
  tenantId?: string;
  status?: DriverStatusInput;
  communicationPreference?: DriverCommunicationPreference;
  contactChannels?: Partial<DriverContactChannels>;
};

export type BulkImportDriversCommand = {
  tenantId?: string;
  items: BulkImportDriverItem[];
};

@Injectable()
export class BulkImportDriversUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: BulkImportDriversCommand) {
    let created = 0;
    let updated = 0;
    const records: ReturnType<Driver["toPrimitives"]>[] = [];

    for (const item of command.items) {
      const tenantId = (item.tenantId ?? command.tenantId ?? this.runtime.getDefaultTenantId()).trim();
      const existingDriver = await this.driverRepository.findByLicenseNumber(item.licenseNumber, tenantId);
      const communicationPreference =
        item.communicationPreference
        ?? existingDriver?.communicationPreference
        ?? "whatsapp";
      const contactChannelUpdate = {
        ...(item.contactChannels ?? {}),
        ...buildPreferredContactChannelUpdate({
          phone: item.phone,
          communicationPreference,
        }),
      };

      if (existingDriver) {
        const updatedDriver = existingDriver
          .update({
            name: composeDriverName(item),
            phone: item.phone,
            email: item.email,
            licenseNumber: item.licenseNumber,
            licenseExpiryDate: item.licenseExpiryDate,
            tenantId,
            status: normalizeDriverStatus(item.status) ?? existingDriver.status,
            communicationPreference,
          })
          .updateContactChannels(contactChannelUpdate);
        await this.driverRepository.save(updatedDriver);
        records.push(updatedDriver.toPrimitives());
        updated += 1;
        continue;
      }

      const createdDriver = Driver.create({
        id: this.runtime.generateId(),
        name: composeDriverName(item),
        phone: item.phone ?? "",
        email: item.email ?? null,
        licenseNumber: item.licenseNumber,
        licenseExpiryDate: item.licenseExpiryDate ?? null,
        tenantId,
        status: normalizeDriverStatus(item.status) ?? "active",
        communicationPreference,
        assignedVehicleId: null,
        contactChannels: {
          whatsappNumber: null,
          smsNumber: null,
          voiceNumber: null,
          ...contactChannelUpdate,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.driverRepository.save(createdDriver);
      records.push(createdDriver.toPrimitives());
      created += 1;
    }

    return {
      created,
      updated,
      total: records.length,
      records,
    };
  }
}
