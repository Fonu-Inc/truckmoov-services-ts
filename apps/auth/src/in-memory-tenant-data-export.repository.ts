import { Injectable } from '@nestjs/common';
import type {
  StoredTenantDataExport,
  TenantDataExportRepository,
  TenantExportOutcome,
} from './tenant-data-export.repository';

@Injectable()
export class InMemoryTenantDataExportRepository implements TenantDataExportRepository {
  private readonly jobs = new Map<string, StoredTenantDataExport>();

  async create(job: StoredTenantDataExport): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async finish(id: string, outcome: TenantExportOutcome): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.set(
      id,
      outcome.status === 'ready'
        ? { ...job, ...outcome }
        : { ...job, status: 'failed', error: outcome.error },
    );
  }

  async findById(tenantId: string, id: string): Promise<StoredTenantDataExport | null> {
    const job = this.jobs.get(id);
    return job && job.tenantId === tenantId ? { ...job } : null;
  }

  async listForTenant(tenantId: string, limit: number): Promise<StoredTenantDataExport[]> {
    return [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
