import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTenantDataExport,
  TenantDataExportRepository,
  TenantExportOutcome,
  TenantExportScope,
  TenantExportStatus,
} from './tenant-data-export.repository';

type Row = Record<string, unknown>;

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toText = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function toExport(row: Row): StoredTenantDataExport {
  const counts = typeof row.row_counts === 'string' ? JSON.parse(row.row_counts) : row.row_counts;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    scope: String(row.scope) as TenantExportScope,
    status: String(row.status) as TenantExportStatus,
    rowCounts: (counts ?? {}) as Record<string, number>,
    fileKey: toText(row.file_key),
    fileName: toText(row.file_name),
    fileBytes: row.file_bytes === null || row.file_bytes === undefined ? null : Number(row.file_bytes),
    error: toText(row.error),
    requestedBy: String(row.requested_by),
    requestedByName: toText(row.requested_by_name),
    createdAt: toDate(row.created_at),
    expiresAt: toDate(row.expires_at),
  };
}

@Injectable()
export class MikroTenantDataExportRepository implements TenantDataExportRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async create(job: StoredTenantDataExport): Promise<void> {
    await this.execute(
      `insert into tenant_data_exports
         (id, tenant_id, scope, status, requested_by, requested_by_name, created_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.id, job.tenantId, job.scope, job.status, job.requestedBy, job.requestedByName, job.createdAt, job.expiresAt],
    );
  }

  async finish(id: string, outcome: TenantExportOutcome): Promise<void> {
    if (outcome.status === 'failed') {
      await this.execute(`update tenant_data_exports set status = 'failed', error = ? where id = ?`, [outcome.error, id]);
      return;
    }
    await this.execute(
      `update tenant_data_exports set status = 'ready', row_counts = ?::jsonb, file_key = ?, file_name = ?, file_bytes = ?
       where id = ?`,
      [JSON.stringify(outcome.rowCounts), outcome.fileKey, outcome.fileName, outcome.fileBytes, id],
    );
  }

  async findById(tenantId: string, id: string): Promise<StoredTenantDataExport | null> {
    const rows = await this.execute('select * from tenant_data_exports where id = ? and tenant_id = ?', [id, tenantId]);
    return rows[0] ? toExport(rows[0]) : null;
  }

  async listForTenant(tenantId: string, limit: number): Promise<StoredTenantDataExport[]> {
    const rows = await this.execute(
      'select * from tenant_data_exports where tenant_id = ? order by created_at desc limit ?',
      [tenantId, limit],
    );
    return rows.map(toExport);
  }

  private async execute(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return (await orm.em.fork().getConnection().execute(sql, params)) as Row[];
  }
}
