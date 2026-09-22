import { Inject, Injectable } from '@nestjs/common';
import { FleetFactsService } from '../../../../fleet-facts.service';
import type {
  ConnectivityVerification,
  DeviceConnectivity,
  TenantConnectivity,
} from '@auth/installation/domain/ports/connectivity-verification.port';

@Injectable()
export class FleetConnectivityVerification implements ConnectivityVerification {
  constructor(
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async forTenant(tenantId: string): Promise<TenantConnectivity | null> {
    const answer = await this.fleet.tenantConnectivity(tenantId);
    if (!answer) return null;

    const devices = answer.items.map<DeviceConnectivity>((item) => ({
      deviceId: String(item.deviceId ?? ''),
      imei: String(item.imei ?? ''),
      manufacturer: String(item.manufacturer ?? ''),
      model: String(item.model ?? ''),
      assignedVehicleId:
        typeof item.assignedVehicleId === 'string' ? item.assignedVehicleId : null,
      reporting: item.reporting === true,
      lastSeen: typeof item.lastSeen === 'string' ? item.lastSeen : null,
      verificationStatus:
        typeof item.verificationStatus === 'string'
          ? item.verificationStatus
          : null,
    }));

    return {
      total: answer.total,
      reporting: devices.filter((device) => device.reporting).length,
      devices,
    };
  }
}
