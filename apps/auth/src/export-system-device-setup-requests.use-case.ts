import { Inject, Injectable } from '@nestjs/common';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import type { DeviceSetupRequestFilters } from './device-setup-request.repository';

function escapeCsvValue(value: unknown) {
  if (value == null) return '';
  const normalized = typeof value === 'string' ? value : String(value);
  if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

@Injectable()
export class ExportSystemDeviceSetupRequestsUseCase {
  constructor(
    @Inject(ListSystemDeviceSetupRequestsUseCase)
    private readonly listUseCase: ListSystemDeviceSetupRequestsUseCase,
  ) {}

  async execute(accessToken: string, filters?: DeviceSetupRequestFilters) {
    const result = await this.listUseCase.execute(accessToken, filters);
    const requests = result.data.requests;
    const headers = [
      'id', 'imei', 'manufacturer', 'model', 'connectionType',
      'requesterName', 'needsSim', 'vehiclePlate', 'location',
      'tenantId', 'status', 'assignedTo', 'notes', 'preferredInstallDate',
      'rejectedReason', 'createdAt', 'updatedAt',
    ];
    const rows = requests.map((r) => [
      r.id, r.imei, r.manufacturer, r.model, r.connectionType,
      r.requesterName, r.needsSim, r.vehiclePlate, r.location,
      r.tenantId, r.status, r.assignedTo, r.notes, r.preferredInstallDate,
      r.rejectedReason, r.createdAt, r.updatedAt,
    ]);
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { filename: `device-setup-requests-${timestamp}.csv`, csv };
  }
}
