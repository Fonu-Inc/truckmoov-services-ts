import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import type { FleetAssetStatus } from "../../../shared/domain/fleet-status";
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
    private readonly config: AppConfigService,
  ) {}

  async execute(command: BulkImportDriversCommand) {
    let created = 0;
    let updated = 0;
    const records: ReturnType<Driver["toPrimitives"]>[] = [];

    for (const item of command.items) {
      const tenantId = (item.tenantId ?? command.tenantId ?? this.config.fleet.defaultTenant).trim();
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
        id: randomUUID(),
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
