import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  INCOMPLETE_CASCADE_STATUSES,
  type CascadePatch,
  type CascadeProgress,
  type CascadeStatus,
  type NewTenantSuspension,
  type StoredTenantSuspension,
  type SuspensionCause,
  type TenantSuspensionRepository,
} from './tenant-suspension.repository';

type Row = {
  tenant_id: string;
  suspended_at: Date | string;
  suspended_by: string;
  reason: string;
  cause: string;
  unpaid_since: string | null;
  grace_days: number | null;
  cascade_status: string;
  cascade_progress: CascadeProgress | string | null;
  cascade_attempts: number;
  cascade_last_error: string | null;
  cascade_completed_at: Date | string | null;
};

const COLUMNS = `tenant_id, suspended_at, suspended_by, reason, cause,
  to_char(unpaid_since, 'YYYY-MM-DD') as unpaid_since, grace_days, cascade_status,
  cascade_progress, cascade_attempts, cascade_last_error, cascade_completed_at`;

function parseProgress(value: Row['cascade_progress']): CascadeProgress {
  if (!value) return {};
  return typeof value === 'string' ? (JSON.parse(value) as CascadeProgress) : value;
}

function toStored(row: Row): StoredTenantSuspension {
  return {
    tenantId: row.tenant_id,
    suspendedAt: new Date(row.suspended_at),
    suspendedBy: row.suspended_by,
    reason: row.reason,
    cause: row.cause as SuspensionCause,
    unpaidSince: row.unpaid_since,
    graceDays: row.grace_days === null ? null : Number(row.grace_days),
    cascadeStatus: row.cascade_status as CascadeStatus,
    cascadeProgress: parseProgress(row.cascade_progress),
    cascadeAttempts: Number(row.cascade_attempts),
    cascadeLastError: row.cascade_last_error,
    cascadeCompletedAt: row.cascade_completed_at ? new Date(row.cascade_completed_at) : null,
  };
}

@Injectable()
export class MikroTenantSuspensionRepository implements TenantSuspensionRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(): Promise<StoredTenantSuspension[]> {
    const rows = await this.query(`select ${COLUMNS} from tenant_suspensions order by suspended_at`);
    return rows.map(toStored);
  }

  async findOne(tenantId: string): Promise<StoredTenantSuspension | null> {
    const rows = await this.query(`select ${COLUMNS} from tenant_suspensions where tenant_id = ?`, [tenantId]);
    return rows[0] ? toStored(rows[0]) : null;
  }

  async insertIfAbsent(row: NewTenantSuspension): Promise<boolean> {
    const written = await this.query(
      `insert into tenant_suspensions (tenant_id, suspended_by, reason, cause, unpaid_since, grace_days,
         cascade_status, cascade_progress)
       values (?, ?, ?, ?, ?, ?, 'pending', '{}'::jsonb)
       on conflict (tenant_id) do nothing returning tenant_id`,
      [row.tenantId, row.suspendedBy, row.reason, row.cause, row.unpaidSince ?? null, row.graceDays ?? null],
    );
    return written.length > 0;
  }

  async upsertManual(row: NewTenantSuspension): Promise<void> {
    await this.query(
      `insert into tenant_suspensions (tenant_id, suspended_by, reason, cause, unpaid_since, grace_days,
         cascade_status, cascade_progress)
       values (?, ?, ?, 'manual', ?, ?, 'pending', '{}'::jsonb)
       on conflict (tenant_id) do update set
         suspended_at = case when tenant_suspensions.cause = 'manual' then tenant_suspensions.suspended_at else now() end,
         suspended_by = case when tenant_suspensions.cause = 'manual' then tenant_suspensions.suspended_by else excluded.suspended_by end,
         reason = excluded.reason, cause = 'manual',
         unpaid_since = coalesce(tenant_suspensions.unpaid_since, excluded.unpaid_since),
         grace_days = coalesce(tenant_suspensions.grace_days, excluded.grace_days),
         cascade_status = 'pending', cascade_progress = '{}'::jsonb, cascade_attempts = 0,
         cascade_last_error = null, cascade_completed_at = null, updated_at = now()`,
      [row.tenantId, row.suspendedBy, row.reason, row.unpaidSince ?? null, row.graceDays ?? null],
    );
  }

  async setCascade(tenantId: string, patch: CascadePatch): Promise<void> {
    await this.query(
      `update tenant_suspensions set cascade_status = ?, cascade_progress = ?::jsonb, cascade_attempts = ?,
         cascade_last_error = ?, cascade_completed_at = ?, updated_at = now() where tenant_id = ?`,
      [
        patch.status,
        JSON.stringify(patch.progress),
        patch.attempts,
        patch.lastError,
        patch.completedAt,
        tenantId,
      ],
    );
  }

  async remove(tenantId: string): Promise<void> {
    await this.query(`delete from tenant_suspensions where tenant_id = ?`, [tenantId]);
  }

  async findIncomplete(): Promise<StoredTenantSuspension[]> {
    const rows = await this.query(
      `select ${COLUMNS} from tenant_suspensions where cascade_status = any(?::text[]) order by suspended_at`,
      [`{${INCOMPLETE_CASCADE_STATUSES.join(',')}}`],
    );
    return rows.map(toStored);
  }

  private async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return (await orm.em.getConnection().execute(sql, params)) as Row[];
  }
}

@Injectable()
export class InMemoryTenantSuspensionRepository implements TenantSuspensionRepository {
  private readonly store = new Map<string, StoredTenantSuspension>();

  async findAll(): Promise<StoredTenantSuspension[]> {
    return [...this.store.values()].map((entry) => structuredClone(entry));
  }

  async findOne(tenantId: string): Promise<StoredTenantSuspension | null> {
    const entry = this.store.get(tenantId);
    return entry ? structuredClone(entry) : null;
  }

  async insertIfAbsent(row: NewTenantSuspension): Promise<boolean> {
    if (this.store.has(row.tenantId)) return false;
    this.store.set(row.tenantId, this.fresh(row));
    return true;
  }

  async upsertManual(row: NewTenantSuspension): Promise<void> {
    const existing = this.store.get(row.tenantId);
    const keep = existing?.cause === 'manual' ? existing : null;
    this.store.set(row.tenantId, {
      ...this.fresh({ ...row, cause: 'manual' }),
      suspendedAt: keep?.suspendedAt ?? new Date(),
      suspendedBy: keep?.suspendedBy ?? row.suspendedBy,
      unpaidSince: existing?.unpaidSince ?? row.unpaidSince ?? null,
      graceDays: existing?.graceDays ?? row.graceDays ?? null,
    });
  }

  async setCascade(tenantId: string, patch: CascadePatch): Promise<void> {
    const entry = this.store.get(tenantId);
    if (!entry) return;
    this.store.set(tenantId, {
      ...entry,
      cascadeStatus: patch.status,
      cascadeProgress: structuredClone(patch.progress),
      cascadeAttempts: patch.attempts,
      cascadeLastError: patch.lastError,
      cascadeCompletedAt: patch.completedAt,
    });
  }

  async remove(tenantId: string): Promise<void> {
    this.store.delete(tenantId);
  }

  async findIncomplete(): Promise<StoredTenantSuspension[]> {
    return (await this.findAll()).filter((entry) => INCOMPLETE_CASCADE_STATUSES.includes(entry.cascadeStatus));
  }

  private fresh(row: NewTenantSuspension): StoredTenantSuspension {
    return {
      tenantId: row.tenantId,
      suspendedAt: new Date(),
      suspendedBy: row.suspendedBy,
      reason: row.reason,
      cause: row.cause,
      unpaidSince: row.unpaidSince ?? null,
      graceDays: row.graceDays ?? null,
      cascadeStatus: 'pending',
      cascadeProgress: {},
      cascadeAttempts: 0,
      cascadeLastError: null,
      cascadeCompletedAt: null,
    };
  }
}
