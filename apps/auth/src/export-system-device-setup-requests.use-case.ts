import { Inject, Injectable } from '@nestjs/common';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import type { DeviceSetupRequestFilters } from './device-setup-request.repository';
import { escapeCsvValue } from '@shared/csv';

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
      'id', 'referenceNumber', 'tenantId', 'organisationName', 'requestingEmail',
      'manufacturer', 'model', 'trackerType', 'quantity', 'simRequired',
      'state', 'city', 'preferredInstallDate', 'useCase', 'notes',
      'status', 'kycStatus', 'assignedTo', 'decidedBy', 'decidedAt',
      'decisionReason', 'createdAt', 'updatedAt',
    ];
    const rows = requests.map((r) => [
      r.id, r.referenceNumber, r.tenantId, r.organisationName, r.requestingEmail,
      r.manufacturer, r.model, r.trackerType, r.quantity, String(r.simRequired),
      r.state, r.city, r.preferredInstallDate, r.useCase, r.notes,
      r.status, r.kycStatus, r.assignedTo, r.decidedBy, r.decidedAt,
      r.decisionReason, r.createdAt, r.updatedAt,
    ]);
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { filename: `device-setup-requests-${timestamp}.csv`, csv };
  }
}
