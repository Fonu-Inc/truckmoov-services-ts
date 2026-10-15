import { Inject, Injectable } from '@nestjs/common';
import { ListSystemSimsUseCase, type SystemSimListFilters } from './list-system-sims.use-case';
import { escapeCsvValue } from '@shared/csv';

const iso = (date: Date | null) => date?.toISOString() ?? '';

export const SIM_EXPORT_HEADERS = [
  'id', 'iccid', 'imsi', 'msisdn', 'carrier', 'plan', 'status',
  'tenantId', 'tenantName', 'deviceId', 'deviceImei', 'dataUsageMb', 'dataLimitMb',
  'smsUsage', 'smsLimit', 'monthlyCostNgn', 'activationDate', 'expiryDate',
  'lastActivity', 'signalStrength', 'networkType', 'roaming',
  'fonuStatus', 'createdAt',
];

@Injectable()
export class ExportSystemSimsUseCase {
  constructor(
    @Inject(ListSystemSimsUseCase)
    private readonly listSimsUseCase: ListSystemSimsUseCase,
  ) {}

  async execute(accessToken: string, filters: SystemSimListFilters) {
    const sims = await this.listSimsUseCase.list(accessToken, filters);

    const rows = sims.map((s) =>
      [
        s.id, s.iccid, s.imsi, s.msisdn, s.carrier, s.plan, s.status,
        s.tenantId, s.tenantName, s.deviceId, s.deviceImei, s.dataUsageMb, s.dataLimitMb,
        s.smsUsage, s.smsLimit, s.monthlyCostNgn, iso(s.activationDate), iso(s.expiryDate),
        iso(s.lastActivity), s.signalStrength, s.networkType, String(s.roaming),
        s.fonuStatus, iso(s.createdAt),
      ]
        .map(escapeCsvValue)
        .join(','),
    );

    const csv = [SIM_EXPORT_HEADERS.join(','), ...rows].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return { csv, filename: `sim-inventory-${timestamp}.csv` };
  }
}
