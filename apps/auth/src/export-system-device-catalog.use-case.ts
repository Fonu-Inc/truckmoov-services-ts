import { Inject, Injectable } from '@nestjs/common';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';

function escapeCsvValue(value: unknown) {
  if (value == null) return '';
  const normalized = typeof value === 'string' ? value : String(value);
  if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

@Injectable()
export class ExportSystemDeviceCatalogUseCase {
  constructor(
    @Inject(ListSystemDeviceCatalogUseCase)
    private readonly listUseCase: ListSystemDeviceCatalogUseCase,
  ) {}

  async execute(
    accessToken: string,
    filters: { search?: string; status?: 'supported' | 'deprecated' | 'blocked' } = {},
  ) {
    const models = await this.listUseCase.list(accessToken, filters);
    const headers = [
      'id', 'manufacturer', 'model', 'protocolType', 'defaultPort',
      'supportedFeatures', 'status', 'configurationInstructions', 'createdAt', 'updatedAt',
    ];
    const rows = models.map((m) => [
      m.id, m.manufacturer, m.model, m.protocolType, m.defaultPort,
      m.supportedFeatures.join(';'), m.status, m.configurationInstructions,
      m.createdAt, m.updatedAt,
    ]);
    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { filename: `system-device-catalog-${timestamp}.csv`, csv };
  }
}
