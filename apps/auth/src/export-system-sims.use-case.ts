import { Inject, Injectable } from '@nestjs/common';
import { ListSystemSimsUseCase } from './list-system-sims.use-case';

function escapeCsvValue(value: unknown) {
  if (value == null) return '';
  const normalized = typeof value === 'string' ? value : String(value);
  if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

@Injectable()
export class ExportSystemSimsUseCase {
  constructor(
    @Inject(ListSystemSimsUseCase)
    private readonly listSimsUseCase: ListSystemSimsUseCase,
  ) {}

  async execute(
    accessToken: string,
    filters: {
      status?: string;
      carrier?: string;
      tenantId?: string;
      search?: string;
    },
  ) {
    const sims = await this.listSimsUseCase.list(accessToken, filters);

    const headers = [
      'id', 'iccid', 'imsi', 'msisdn', 'carrier', 'plan', 'status',
      'tenantId', 'deviceId', 'dataUsageMb', 'dataLimitMb',
      'monthlyCostNgn', 'activationDate', 'networkType', 'roaming',
      'fonuStatus', 'createdAt',
    ];

    const rows = sims.map((s) =>
      [
        s.id, s.iccid, s.imsi ?? '', s.msisdn ?? '', s.carrier, s.plan,
        s.status, s.tenantId ?? '', s.deviceId ?? '', s.dataUsageMb,
        s.dataLimitMb, s.monthlyCostNgn,
        s.activationDate?.toISOString() ?? '',
        s.networkType ?? '', s.roaming,
        s.fonuStatus ?? '', s.createdAt.toISOString(),
      ]
        .map(escapeCsvValue)
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { csv, filename: `sim-inventory-${timestamp}.csv` };
  }
}
