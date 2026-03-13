import { Inject, Injectable } from "@nestjs/common";
import type { FleetAssetStatus } from "@fleet/shared/domain/fleet-status";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { Driver, type DriverContactChannels } from "../../domain/entities/driver.entity";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "../../domain/repositories/driver.repository";

export type BulkImportDriverItem = {
  name: string;
  licenseNumber: string;
  tenantId?: string;
  status?: FleetAssetStatus;
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

      if (existingDriver) {
        const updatedDriver = existingDriver
          .update({
            name: item.name,
            licenseNumber: item.licenseNumber,
            tenantId,
            status: item.status ?? existingDriver.status,
          })
          .updateContactChannels(item.contactChannels ?? {});
        await this.driverRepository.save(updatedDriver);
        records.push(updatedDriver.toPrimitives());
        updated += 1;
        continue;
      }

      const createdDriver = Driver.create({
        id: this.runtime.generateId(),
        name: item.name,
        licenseNumber: item.licenseNumber,
        tenantId,
        status: item.status ?? "active",
        assignedVehicleId: null,
        contactChannels: {
          whatsappNumber: item.contactChannels?.whatsappNumber ?? null,
          smsNumber: item.contactChannels?.smsNumber ?? null,
          voiceNumber: item.contactChannels?.voiceNumber ?? null,
        },
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
