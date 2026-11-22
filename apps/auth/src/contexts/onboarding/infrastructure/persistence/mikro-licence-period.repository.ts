import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  DUPLICATE_PAYMENT_NOTE,
  type LicencePeriodOrigin,
  type LicencePeriodRepository,
  type LicencePeriodStatus,
  type NewLicencePeriod,
  type PurchaseSeed,
  type RenewalSettlement,
  type RenewalSettlementInput,
  type StoredLicencePeriod,
} from '@auth/onboarding/domain/licence-period.repository';
import { nextPeriodDates } from '@auth/onboarding/domain/licence-renewal';
import { recomputeInvoicePaid } from './mikro-invoice.repository';

type Row = Record<string, unknown>;

const COLUMNS = `id, tenant_id, application_id, plan_code, device_count,
  to_char(period_start, 'YYYY-MM-DD') as period_start, to_char(period_end, 'YYYY-MM-DD') as period_end,
  status, renewal_invoice_id, origin, created_at, updated_at`;

const asDate = (value: unknown) => new Date(value as string | number | Date);

function toPeriod(r: Row): StoredLicencePeriod {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    applicationId: String(r.application_id),
    planCode: String(r.plan_code),
    deviceCount: Number(r.device_count),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    status: String(r.status) as LicencePeriodStatus,
    renewalInvoiceId: r.renewal_invoice_id == null ? null : String(r.renewal_invoice_id),
    origin: String(r.origin) as LicencePeriodOrigin,
    createdAt: asDate(r.created_at),
    updatedAt: asDate(r.updated_at),
  };
}

@Injectable()
export class MikroLicencePeriodRepository implements LicencePeriodRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  private async run(sql: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.em()).getConnection().execute<Row[]>(sql, params);
  }

  async currentPlanCodes(): Promise<Map<string, string>> {
    const rows = await this.run(
      `select distinct on (tenant_id) tenant_id, plan_code from tenant_licence_periods
        order by tenant_id, (status = 'active') desc, period_end desc`,
    );
    return new Map(rows.map((row) => [String(row.tenant_id), String(row.plan_code)]));
  }

  async purchaseSeeds(): Promise<PurchaseSeed[]> {
    const rows = await this.run(
      `select distinct on (a.tenant_id) a.tenant_id, i.application_id, l.plan_code, l.quantity,
              l.validity_days, pay.paid_at
         from billing_invoices i
         join onboarding_applications a on a.id = i.application_id
         join billing_invoice_lines l
           on l.invoice_id = i.id and l.kind = 'plan' and not l.is_renewal
         join lateral (
           select max(p.paid_at) as paid_at from onboarding_payments p
            where p.status = 'paid'
              and (p.invoice_id = i.id
                   or (i.quotation_id is not null and p.quotation_id = i.quotation_id))
         ) pay on pay.paid_at is not null
        where i.status = 'paid' and a.tenant_id is not null and a.tenant_id <> 'system'
          and l.plan_code is not null and l.validity_days is not null
          and not exists (select 1 from tenant_licence_periods t where t.tenant_id = a.tenant_id)
        order by a.tenant_id, pay.paid_at desc`,
    );
    return rows.map((row) => ({
      tenantId: String(row.tenant_id),
      applicationId: String(row.application_id),
      planCode: String(row.plan_code),
      quantity: Number(row.quantity),
      validityDays: Number(row.validity_days),
      paidAt: asDate(row.paid_at),
    }));
  }

  async insertSeeded(period: NewLicencePeriod): Promise<boolean> {
    const rows = await this.run(
      `insert into tenant_licence_periods
         (tenant_id, application_id, plan_code, device_count, period_start, period_end, origin)
       values (?, ?, ?, ?, ?::date, ?::date, ?)
       on conflict do nothing returning id`,
      [
        period.tenantId, period.applicationId, period.planCode, period.deviceCount,
        period.periodStart, period.periodEnd, period.origin,
      ],
    );
    return rows.length === 1;
  }

  async listDue(cutoff: string): Promise<StoredLicencePeriod[]> {
    const rows = await this.run(
      `select ${COLUMNS} from tenant_licence_periods
        where status = 'active' and renewal_invoice_id is null and period_end <= ?::date
        order by period_end, tenant_id`,
      [cutoff],
    );
    return rows.map(toPeriod);
  }

  async listByTenant(tenantId: string): Promise<StoredLicencePeriod[]> {
    const rows = await this.run(
      `select ${COLUMNS} from tenant_licence_periods
        where tenant_id = ? order by period_start desc, created_at desc`,
      [tenantId],
    );
    return rows.map(toPeriod);
  }

  async findActiveByTenant(tenantId: string): Promise<StoredLicencePeriod | null> {
    const rows = await this.run(
      `select ${COLUMNS} from tenant_licence_periods where tenant_id = ? and status = 'active' limit 1`,
      [tenantId],
    );
    return rows[0] ? toPeriod(rows[0]) : null;
  }

  async findByRenewalInvoiceId(invoiceId: string): Promise<StoredLicencePeriod | null> {
    const rows = await this.run(
      `select ${COLUMNS} from tenant_licence_periods where renewal_invoice_id = ? limit 1`,
      [invoiceId],
    );
    return rows[0] ? toPeriod(rows[0]) : null;
  }

  async periodEndsForInvoices(invoiceIds: string[]): Promise<Map<string, string>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.run(
      `select renewal_invoice_id, to_char(period_end, 'YYYY-MM-DD') as period_end
         from tenant_licence_periods where renewal_invoice_id in (${invoiceIds.map(() => '?').join(', ')})`,
      invoiceIds,
    );
    return new Map(rows.map((row) => [String(row.renewal_invoice_id), String(row.period_end)]));
  }

  async release(periodId: string, planCode: string): Promise<void> {
    await this.run(
      `update tenant_licence_periods set renewal_invoice_id = null, plan_code = ?, updated_at = now()
        where id = ? and status = 'active'`,
      [planCode, periodId],
    );
  }

  async end(periodId: string): Promise<void> {
    await this.run(
      `update tenant_licence_periods set status = 'ended', updated_at = now()
        where id = ? and status = 'active'`,
      [periodId],
    );
  }

  async settleRenewalPayment(input: RenewalSettlementInput): Promise<RenewalSettlement> {
    const em = await this.em();
    return em.transactional((tx) => this.settleInTx(tx, input));
  }

  private async settleInTx(tx: EntityManager, input: RenewalSettlementInput): Promise<RenewalSettlement> {
    const connection = tx.getConnection();
    const ctx = tx.getTransactionContext();
    const query = (sql: string, params: unknown[]) => connection.execute<Row[]>(sql, params, 'all', ctx);

    const [invoice] = await query(
      `select status, total_kobo from billing_invoices where id = ? for update`,
      [input.invoiceId],
    );
    const [payment] = await query(`select status, amount_kobo from onboarding_payments where id = ?`, [
      input.paymentId,
    ]);
    if (!invoice || payment?.status !== 'paid') return { outcome: 'not_applicable' };

    const total = Number(invoice.total_kobo);
    const amountKobo = Number(payment.amount_kobo);
    const [others] = await query(
      `select coalesce(sum(amount_kobo), 0) as paid from onboarding_payments
        where invoice_id = ? and status = 'paid' and id <> ?`,
      [input.invoiceId, input.paymentId],
    );
    const closed = invoice.status === 'cancelled' || invoice.status === 'draft';
    // Refused whole when it would take the invoice past its total: the money goes back to the wallet.
    if (closed || Number(others?.paid ?? 0) + amountKobo > total) {
      await query(
        `update onboarding_payments set status = 'refunded', note = ?, updated_at = now()
          where id = ? and status = 'paid' returning id`,
        [DUPLICATE_PAYMENT_NOTE, input.paymentId],
      );
      return { outcome: 'duplicate', amountKobo, reason: closed ? 'invoice_closed' : 'duplicate' };
    }

    await recomputeInvoicePaid(tx, input.invoiceId);
    if (Number(others?.paid ?? 0) + amountKobo < total) return { outcome: 'partial' };
    return this.extendPeriod(query, input);
  }

  private async extendPeriod(
    query: (sql: string, params: unknown[]) => Promise<Row[]>,
    input: RenewalSettlementInput,
  ): Promise<RenewalSettlement> {
    const [period] = await query(
      `select ${COLUMNS} from tenant_licence_periods where renewal_invoice_id = ? for update`,
      [input.invoiceId],
    );
    if (!period) return { outcome: 'no_change', newPeriodEnd: null };
    const current = toPeriod(period);
    if (current.status !== 'active') {
      const [active] = await query(
        `select to_char(period_end, 'YYYY-MM-DD') as period_end from tenant_licence_periods
          where tenant_id = ? and status = 'active' limit 1`,
        [current.tenantId],
      );
      return { outcome: 'no_change', newPeriodEnd: active ? String(active.period_end) : null };
    }

    const [line] = await query(
      `select plan_code, quantity, validity_days from billing_invoice_lines
        where invoice_id = ? and kind = 'plan' and is_renewal limit 1`,
      [input.invoiceId],
    );
    if (!line || line.validity_days == null) return { outcome: 'no_change', newPeriodEnd: null };

    const next = nextPeriodDates(current.periodEnd, Number(line.validity_days), input.today);
    await query(
      `update tenant_licence_periods set status = 'renewed', updated_at = now()
        where id = ? and status = 'active' returning id`,
      [current.id],
    );
    await query(
      `insert into tenant_licence_periods
         (tenant_id, application_id, plan_code, device_count, period_start, period_end, origin)
       values (?, ?, ?, ?, ?::date, ?::date, 'renewal') returning id`,
      [
        current.tenantId, current.applicationId, String(line.plan_code ?? current.planCode),
        Number(line.quantity), next.periodStart, next.periodEnd,
      ],
    );
    return { outcome: 'renewed', newPeriodEnd: next.periodEnd };
  }
}
