import { Inject, Injectable } from '@nestjs/common';
import { ListSystemSimRequestsUseCase } from './list-system-sim-requests.use-case';
import type { SimProvisioningRequestFilters } from './sim-provisioning-request.repository';
import { escapeCsvValue } from '@shared/csv';

@Injectable()
export class ExportSystemSimRequestsUseCase {
  constructor(
    @Inject(ListSystemSimRequestsUseCase)
    private readonly listUseCase: ListSystemSimRequestsUseCase,
  ) {}

  async execute(accessToken: string, filters?: SimProvisioningRequestFilters) {
    const result = await this.listUseCase.execute(accessToken, filters);
    const requests = result.data.requests;

    const headers = [
      'id', 'tenantId', 'tenantName', 'requestType', 'numberOfSims',
      'preferredOperator', 'requestedPlan', 'requestedDataLimitMb',
      'deploymentTimeline', 'useCase', 'status', 'approvedByName',
      'approvedAt', 'rejectedReason', 'createdAt',
    ];

    const rows = requests.map((r) => [
      r.id, r.tenantId, r.tenantName, r.requestType, r.numberOfSims,
      r.preferredOperator, r.requestedPlan, r.requestedDataLimitMb,
      r.deploymentTimeline, r.useCase, r.status, r.approvedByName,
      r.approvedAt, r.rejectedReason, r.createdAt,
    ]);

    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { csv, filename: `sim-requests-${timestamp}.csv` };
  }
}
