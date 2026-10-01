import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { EnforcementSourceKind } from './enforcement-queries.repository';

export type NewArrear = {
  tenantId: string;
  reference: string;
  dueDate: string;
  amountKobo: number;
  quantity: number;
};

export type StoredArrear = NewArrear & { id: string };

export type OwedItem = {
  source: EnforcementSourceKind;
  reference: string;
  dueDate: string;
  owedKobo: number;
};

export type ArrearResolution = 'paid' | 'no_charge';

export interface ArrearsRepository {
  /** False when the reference is already recorded. */
  record(arrear: NewArrear): Promise<boolean>;
  /** Oldest first. */
  listOpen(tenantId: string): Promise<StoredArrear[]>;
  tenantsWithOpen(): Promise<string[]>;
  resolve(id: string, resolution: ArrearResolution): Promise<void>;
  /** Everything the tenant owes today: unpaid invoices and open arrears, oldest first. */
  openItems(tenantId: string): Promise<OwedItem[]>;
}

export const ARREARS_REPOSITORY = Symbol('ARREARS_REPOSITORY');

type Row = Record<string, unknown>;

const day = (column: string) => `to_char(${column}, 'YYYY-MM-DD')`;

@Injectable()
export class MikroArrearsRepository implements ArrearsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async record(arrear: NewArrear): Promise<boolean> {
    const rows = await this.run(
      `insert into billing_arrears (tenant_id, source, reference, due_date, amount_kobo, quantity)
       values (?, 'sim_monthly', ?, ?, ?, ?)
       on conflict (reference) do nothing returning id`,
      [arrear.tenantId, arrear.reference, arrear.dueDate, arrear.amountKobo, arrear.quantity],
    );
    return rows.length > 0;
  }

  async listOpen(tenantId: string): Promise<StoredArrear[]> {
    const rows = await this.run(
      `select id, tenant_id, reference, ${day('due_date')} as due_date, amount_kobo, quantity
       from billing_arrears where tenant_id = ? and resolved_at is null order by due_date, created_at`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      reference: String(row.reference),
      dueDate: String(row.due_date),
      amountKobo: Number(row.amount_kobo),
      quantity: Number(row.quantity ?? 1),
    }));
  }

  async tenantsWithOpen(): Promise<string[]> {
    const rows = await this.run(
      `select distinct tenant_id from billing_arrears where resolved_at is null`,
      [],
    );
    return rows.map((row) => String(row.tenant_id));
  }

  async resolve(id: string, resolution: ArrearResolution): Promise<void> {
    await this.run(
      `update billing_arrears set resolved_at = now(), resolution = ? where id = ? and resolved_at is null`,
      [resolution, id],
    );
  }

  async openItems(tenantId: string): Promise<OwedItem[]> {
    const rows = await this.run(
      `select * from (
         select 'invoice' as source, i.number as reference, ${day('i.due_date')} as due_date,
                (i.total_kobo - i.amount_paid_kobo) as owed_kobo
         from billing_invoices i
         left join onboarding_applications a on a.id = i.application_id
         where coalesce(i.tenant_id, a.tenant_id) = ?
           and i.status in ('issued', 'partially_paid', 'overdue') and i.total_kobo > i.amount_paid_kobo
         union all
         select r.source, r.reference, ${day('r.due_date')}, r.amount_kobo
         from billing_arrears r where r.tenant_id = ? and r.resolved_at is null
       ) owed order by due_date, reference`,
      [tenantId, tenantId],
    );
    return rows.map((row) => ({
      source: row.source as EnforcementSourceKind,
      reference: String(row.reference),
      dueDate: String(row.due_date),
      owedKobo: Number(row.owed_kobo),
    }));
  }

  private async run(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}
