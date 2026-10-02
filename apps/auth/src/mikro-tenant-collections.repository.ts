import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { PaymentMethod } from '@auth/onboarding/domain/payment-method';
import type { TenantCollectionsRepository, TenantLastPayment } from './tenant-collections.repository';

type Row = Record<string, unknown>;

const ATTRIBUTED_PAYMENTS = `
  select coalesce(i.tenant_id, a.tenant_id) as tenant_id, p.amount_kobo, p.paid_at, p.method
  from onboarding_payments p
  left join billing_invoices i on i.id = p.invoice_id
  left join onboarding_applications a on a.id = p.application_id
  where p.status = 'paid' and p.paid_at is not null`;

@Injectable()
export class MikroTenantCollectionsRepository implements TenantCollectionsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async run(sql: string, params: unknown[] = []): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }

  async collectedKoboByTenant(from: Date, to: Date): Promise<Map<string, number>> {
    const rows = await this.run(
      `select tenant_id, sum(amount_kobo)::bigint as kobo from (
         select tenant_id, amount_kobo from (${ATTRIBUTED_PAYMENTS}) p
          where coalesce(p.method, '') <> 'wallet' and p.paid_at >= ? and p.paid_at < ?
         union all
         select t.tenant_id, t.amount_kobo from wallet_top_ups t
          where t.status = 'success' and t.settled_at >= ? and t.settled_at < ?
       ) c
       where tenant_id is not null and tenant_id <> 'system'
       group by tenant_id`,
      [from, to, from, to],
    );
    return new Map(rows.map((row) => [String(row.tenant_id), Number(row.kobo)]));
  }

  async lastPaymentForTenant(tenantId: string): Promise<TenantLastPayment | null> {
    const rows = await this.run(
      `select amount_kobo, paid_at, method from (${ATTRIBUTED_PAYMENTS}) p
        where p.tenant_id = ? order by p.paid_at desc limit 1`,
      [tenantId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      amountKobo: Number(row.amount_kobo),
      paidAt: new Date(row.paid_at as string | Date),
      method: (row.method as PaymentMethod | null) ?? null,
    };
  }
}
