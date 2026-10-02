import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { StoredTenantTrial, TenantTrialRepository } from './tenant-trial.repository';

type Row = Record<string, unknown>;

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

function toTrial(row: Row): StoredTenantTrial {
  return {
    tenantId: String(row.tenant_id),
    startedAt: toDate(row.started_at),
    trialEndsAt: toDate(row.trial_ends_at),
    extendedCount: Number(row.extended_count),
    convertedAt: row.converted_at ? toDate(row.converted_at) : null,
    convertedPlanCode: row.converted_plan_code ? String(row.converted_plan_code) : null,
  };
}

@Injectable()
export class MikroTenantTrialRepository implements TenantTrialRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenant(tenantId: string): Promise<StoredTenantTrial | null> {
    const rows = await this.execute('select * from tenant_trials where tenant_id = ?', [tenantId]);
    return rows[0] ? toTrial(rows[0]) : null;
  }

  async startIfAbsent(tenantId: string, startedAt: Date, trialEndsAt: Date): Promise<boolean> {
    const rows = await this.execute(
      `insert into tenant_trials (tenant_id, started_at, trial_ends_at) values (?, ?, ?)
       on conflict (tenant_id) do nothing returning tenant_id`,
      [tenantId, startedAt, trialEndsAt],
    );
    return rows.length > 0;
  }

  async extend(tenantId: string, trialEndsAt: Date, updatedBy: string): Promise<void> {
    await this.execute(
      `update tenant_trials set trial_ends_at = ?, extended_count = extended_count + 1,
         updated_by = ?, updated_at = now() where tenant_id = ?`,
      [trialEndsAt, updatedBy, tenantId],
    );
  }

  async markConverted(tenantId: string, at: Date, planCode: string, updatedBy: string): Promise<void> {
    await this.execute(
      `update tenant_trials set converted_at = ?, converted_plan_code = ?, updated_by = ?, updated_at = now()
       where tenant_id = ?`,
      [at, planCode, updatedBy, tenantId],
    );
  }

  private async execute(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return (await orm.em.fork().getConnection().execute(sql, params)) as Row[];
  }
}
