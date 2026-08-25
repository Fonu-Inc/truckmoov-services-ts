import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { Driver } from "../../domain/entities/driver.entity";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";
import type {
  DriverCommunicationPreference,
  DriverStatusInput,
} from "../../domain/entities/driver.entity";
import { normalizeDriverStatus } from "../../domain/entities/driver.entity";
import {
  buildPreferredContactChannelUpdate,
  composeDriverName,
} from "../support/driver-input";
import { QuotaService } from "../../../../../quota.service";

export type CreateDriverCommand = {
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
};

@Injectable()
export class CreateDriverUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY)
    private readonly driverRepository: DriverRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {}

  async execute(command: CreateDriverCommand) {
    await this.assertQuotaAllowsAnotherDriver(command);

    const communicationPreference = command.communicationPreference ?? "whatsapp";
    const driver = Driver.create({
      id: this.runtime.generateId(),
      // The UI submits split first/last names, but older clients still send a single name field.
      name: composeDriverName(command),
      phone: command.phone ?? "",
      email: command.email ?? null,
      licenseNumber: command.licenseNumber,
      licenseExpiryDate: command.licenseExpiryDate ?? null,
      tenantId: command.tenantId ?? this.runtime.getDefaultTenantId(),
      status: normalizeDriverStatus(command.status) ?? "active",
      communicationPreference,
      assignedVehicleId: null,
      contactChannels: {
        whatsappNumber: null,
        smsNumber: null,
        voiceNumber: null,
        ...buildPreferredContactChannelUpdate({
          phone: command.phone,
          communicationPreference,
        }),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await this.driverRepository.save(driver);
    return driver.toPrimitives();
  }

  /** Counted per tenant, so one organisation's drivers never affect another. */
  private async assertQuotaAllowsAnotherDriver(command: CreateDriverCommand): Promise<void> {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    const existing = await this.driverRepository.findAll({ tenantId });
    await this.quotaService.assertWithinQuota(tenantId, "drivers", existing.length);
  }
}
