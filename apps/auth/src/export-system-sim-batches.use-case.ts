import { Inject, Injectable } from '@nestjs/common';
import { ListSystemSimBatchesUseCase } from './list-system-sim-batches.use-case';
import type { SimActivationBatchFilters } from './sim-activation-batch.repository';
import { escapeCsvValue } from '@shared/csv';

@Injectable()
export class ExportSystemSimBatchesUseCase {
  constructor(
    @Inject(ListSystemSimBatchesUseCase)
    private readonly listUseCase: ListSystemSimBatchesUseCase,
  ) {}

  async execute(accessToken: string, filters?: SimActivationBatchFilters) {
    const result = await this.listUseCase.execute(accessToken, filters);
    const batches = result.data.batches;

    const headers = [
      'id', 'requestId', 'tenantId', 'tenantName', 'activationMode',
      'quantity', 'operator', 'requestedPlan', 'dataLimitGb', 'status',
      'simsActivated', 'simsFailed', 'createdByName', 'startedAt',
      'completedAt', 'errorMessage', 'createdAt',
    ];

    const rows = batches.map((b) => [
      b.id, b.requestId, b.tenantId, b.tenantName, b.activationMode,
      b.quantity, b.operator, b.requestedPlan, b.dataLimitGb, b.status,
      b.simsActivated, b.simsFailed, b.createdByName, b.startedAt,
      b.completedAt, b.errorMessage, b.createdAt,
    ]);

    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { csv, filename: `sim-activation-batches-${timestamp}.csv` };
  }
}
