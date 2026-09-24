import { Inject, Injectable } from '@nestjs/common';
import { FleetFactsService } from '../../../../fleet-facts.service';
import type {
  JobDevice,
  JobDeviceLookup,
} from '@auth/installation/domain/ports/job-device-lookup.port';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toJobDevice(item: Record<string, unknown>): JobDevice {
  return {
    id: String(item.id ?? ''),
    name: text(item.name),
    imei: String(item.imei ?? ''),
    manufacturer: String(item.manufacturer ?? ''),
    model: String(item.model ?? ''),
    status: String(item.status ?? ''),
    statusLabel: String(item.statusLabel ?? ''),
    deviceType: text(item.deviceType),
    verificationStatus: text(item.verificationStatus),
  };
}

@Injectable()
export class FleetJobDeviceLookup implements JobDeviceLookup {
  constructor(@Inject(FleetFactsService) private readonly fleet: FleetFactsService) {}

  async forTenant(tenantId: string, deviceIds: string[]): Promise<Map<string, JobDevice> | null> {
    const items = await this.fleet.tenantDevicesByIds(tenantId, [...new Set(deviceIds)]);
    if (!items) return null;
    const devices = items.map(toJobDevice);
    return new Map(devices.map((device) => [device.id, device]));
  }
}
