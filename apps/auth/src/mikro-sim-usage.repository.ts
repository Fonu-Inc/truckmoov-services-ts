import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { SimUsageRepository, SimUsageTotals } from './sim-usage.repository';

type Row = Record<string, unknown>;

@Injectable()
export class MikroSimUsageRepository implements SimUsageRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async run(sql: string, params: unknown[] = []): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }

  async currentTotals(): Promise<SimUsageTotals> {
    const rows = await this.run(
      'select coalesce(sum(data_usage_mb), 0) as total_mb, count(*)::int as sims from iot_sims',
    );
    return { totalUsageMb: Number(rows[0]?.total_mb ?? 0), simsCount: Number(rows[0]?.sims ?? 0) };
  }

  async saveSnapshot(day: string, totals: SimUsageTotals, capturedAt: Date): Promise<void> {
    await this.run(
      `insert into sim_usage_daily (day, total_usage_mb, sims_count, captured_at) values (?, ?, ?, ?)
       on conflict (day) do update
         set total_usage_mb = excluded.total_usage_mb, sims_count = excluded.sims_count, captured_at = excluded.captured_at`,
      [day, totals.totalUsageMb, totals.simsCount, capturedAt],
    );
  }

  async snapshotsBetween(fromDay: string, toDay: string): Promise<Map<string, number>> {
    const rows = await this.run(
      `select to_char(day, 'YYYY-MM-DD') as day, total_usage_mb from sim_usage_daily where day between ?::date and ?::date`,
      [fromDay, toDay],
    );
    return new Map(rows.map((row) => [String(row.day), Number(row.total_usage_mb)]));
  }

  async totalBundleMbBought(): Promise<number> {
    const rows = await this.run(
      `select coalesce(sum(data_total_mb), 0) as total_mb from bundle_allocations where status <> 'cancelled'`,
    );
    return Number(rows[0]?.total_mb ?? 0);
  }
}
