import { Inject, Injectable } from '@nestjs/common';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import type { DeviceInventoryFilters } from './system-device-inventory-query';
import { escapeCsvValue } from '@shared/csv';

@Injectable()
export class ExportSystemDeviceInventoryUseCase {
  constructor(
    @Inject(ListSystemDeviceInventoryUseCase)
    private readonly listSystemDeviceInventoryUseCase: ListSystemDeviceInventoryUseCase,
  ) {}

  async execute(
    accessToken: string,
    filters: DeviceInventoryFilters,
  ) {
    const devices = await this.listSystemDeviceInventoryUseCase.listAll(
      accessToken,
      filters,
    );

    const headers = [
      'id',
      'imei',
      'manufacturer',
      'model',
      'tenantId',
      'tenantName',
      'lifecycleStatus',
      'operationalStatus',
      'signalStrength',
      'lastSeen',
      'vehicleId',
      'assignedAt',
      'createdAt',
      'updatedAt',
    ];

    const rows = devices.map((device) => [
      device.id,
      device.imei,
      device.manufacturer,
      device.model,
      device.tenantId,
      device.tenantName,
      device.lifecycleStatus,
      device.operationalStatus,
      device.signalStrength,
      device.lastSeen,
      device.vehicleId,
      device.assignedAt,
      device.createdAt,
      device.updatedAt,
    ]);

    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `system-device-inventory-${timestamp}.csv`,
      csv,
    };
  }
}
