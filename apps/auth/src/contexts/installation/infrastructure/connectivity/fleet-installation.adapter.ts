import { Inject, Injectable } from '@nestjs/common';
import { FleetFactsService } from '../../../../fleet-facts.service';
import {
  FleetDeviceRefusedError,
  FleetUnavailableError,
} from '@auth/installation/domain/installation-job.errors';
import type {
  InstallationFleet,
  InstalledUnit,
  VerificationStart,
} from '@auth/installation/domain/ports/installation-fleet.port';

@Injectable()
export class FleetInstallationAdapter implements InstallationFleet {
  constructor(@Inject(FleetFactsService) private readonly fleet: FleetFactsService) {}

  async beginVerification(tenantId: string, deviceIds: string[]): Promise<VerificationStart[] | null> {
    const items = await this.fleet.beginDeviceVerification(tenantId, deviceIds);
    if (!items) return null;
    return items.map((item) => ({
      deviceId: String(item.deviceId ?? ''),
      outcome: item.outcome as VerificationStart['outcome'],
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    }));
  }

  async handOver(tenantId: string, unit: InstalledUnit): Promise<void> {
    const { vehicle } = unit;
    const answer = await this.fleet.handOverInstalledUnit(tenantId, {
      deviceId: unit.deviceId,
      vehicle: {
        registrationNumber: vehicle.registrationNumber,
        vehicleType: vehicle.vehicleType,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        chassisNumber: vehicle.chassisNumber,
      },
    });
    if (answer.ok) return;
    if (answer.status >= 500) throw new FleetUnavailableError();
    throw new FleetDeviceRefusedError(answer.message);
  }
}
