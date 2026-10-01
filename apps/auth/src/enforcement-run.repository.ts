import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';

export type RunStats = { notified: number; suspended: number; restored: number; capped: number };

export interface EnforcementRunRepository {
  /** Null when today's pass already ran, is running, or finished. */
  claim(runDate: string): Promise<string | null>;
  recordSkip(runDate: string, reason: string): Promise<void>;
  finish(id: string, stats: RunStats): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export const ENFORCEMENT_RUN_REPOSITORY = Symbol('ENFORCEMENT_RUN_REPOSITORY');

type Row = Record<string, unknown>;

@Injectable()
export class MikroEnforcementRunRepository implements EnforcementRunRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async claim(runDate: string): Promise<string | null> {
    const rows = await this.run(
      `insert into enforcement_runs (kind, run_date) values ('daily', ?)
       on conflict (kind, run_date) do update set
         started_at = now(), finished_at = null, skipped_reason = null, error = null
       where enforcement_runs.skipped_reason is not null
          or (enforcement_runs.finished_at is null and enforcement_runs.started_at < now() - interval '1 hour')
       returning id`,
      [runDate],
    );
    return rows[0] ? String(rows[0].id) : null;
  }

  async recordSkip(runDate: string, reason: string): Promise<void> {
    await this.run(
      `insert into enforcement_runs (kind, run_date, finished_at, skipped_reason)
       values ('daily', ?, now(), ?) on conflict (kind, run_date) do nothing`,
      [runDate, reason],
    );
  }

  async finish(id: string, stats: RunStats): Promise<void> {
    await this.run(
      `update enforcement_runs set finished_at = now(), notified = ?, suspended = ?, restored = ?, capped = ?
       where id = ?`,
      [stats.notified, stats.suspended, stats.restored, stats.capped, id],
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await this.run(`update enforcement_runs set error = left(?, 500) where id = ?`, [error, id]);
  }

  private async run(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}
