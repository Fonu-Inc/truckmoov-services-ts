import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { OnboardingOrderSummary } from '@auth/onboarding/domain/onboarding-order';
import type {
  OnboardingPaymentStatus,
  StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import type {
  PaymentHistoryFilter,
  PaymentHistoryRepository,
  PaymentHistoryRow,
  TenantPaidAmount,
  TenantPaymentFilter,
  TenantPaymentRow,
} from '@auth/onboarding/domain/payment-history.repository';
import type { PaymentMethod } from '@auth/onboarding/domain/payment-method';

type Row = Record<string, unknown>;

const asDate = (value: unknown) => new Date(value as string | number | Date);
const asNullableString = (value: unknown) => (value == null ? null : String(value));

const SOURCE = `from (
  select p.id, p.application_id, p.reference, p.provider, p.amount_kobo,
    p.authorization_url, p.billing_email, p.plan_code, p.device_count, p.order_summary,
    p.quotation_id, p.invoice_id, p.method, p.note, p.auto_reconciled, p.status,
    p.paid_at, p.created_at, p.updated_at, p.customer_name as stored_customer_name,
    coalesce(p.customer_name, q.customer_name, a.organization_name, '') as customer_name,
    q.number as quotation_number, i.number as invoice_number,
    coalesce(p.order_summary->>'planName', m.name, p.plan_code) as product_name,
    coalesce(i.tenant_id, q.tenant_id, a.tenant_id) as owner_tenant_id,
    exists (select 1 from billing_invoice_lines l
             where l.invoice_id = p.invoice_id and l.kind = 'plan' and l.is_renewal) as is_renewal
  from onboarding_payments p
  left join billing_quotations q on q.id = p.quotation_id
  left join billing_invoices i on i.id = p.invoice_id
  left join onboarding_applications a on a.id = p.application_id
  left join m2m_license_plans m on m.code = p.plan_code
) x`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function listWhere(filter: PaymentHistoryFilter) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const needle = filter.q?.trim();
  if (needle) {
    clauses.push(
      `(x.reference ilike ? escape '\\' or x.customer_name ilike ? escape '\\' or x.quotation_number ilike ? escape '\\')`,
    );
    const pattern = `%${escapeLike(needle)}%`;
    params.push(pattern, pattern, pattern);
  }
  if (filter.statuses) {
    clauses.push(`x.status in (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.method) {
    clauses.push('x.method = ?');
    params.push(filter.method);
  }
  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const LAGOS_DAY = `(coalesce(x.paid_at, x.created_at) at time zone 'Africa/Lagos')::date`;

function tenantWhere(filter: TenantPaymentFilter) {
  const clauses = ['x.owner_tenant_id = ?'];
  const params: unknown[] = [filter.tenantId];
  const needle = filter.q?.trim();
  if (needle) {
    clauses.push(
      `(x.reference ilike ? escape '\\' or x.invoice_number ilike ? escape '\\'
        or x.quotation_number ilike ? escape '\\' or x.product_name ilike ? escape '\\')`,
    );
    const pattern = `%${escapeLike(needle)}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  if (filter.statuses) {
    clauses.push(`x.status in (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.method) {
    clauses.push('x.method = ?');
    params.push(filter.method);
  }
  if (filter.from) {
    clauses.push(`${LAGOS_DAY} >= ?::date`);
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push(`${LAGOS_DAY} <= ?::date`);
    params.push(filter.to);
  }
  return { sql: `where ${clauses.join(' and ')}`, params };
}

function toPayment(r: Row): StoredOnboardingPayment {
  return {
    id: String(r.id),
    applicationId: String(r.application_id),
    reference: String(r.reference),
    provider: String(r.provider),
    amountKobo: Number(r.amount_kobo),
    authorizationUrl: asNullableString(r.authorization_url),
    billingEmail: String(r.billing_email),
    planCode: String(r.plan_code),
    deviceCount: Number(r.device_count),
    orderSummary: (r.order_summary as OnboardingOrderSummary | null) ?? null,
    quotationId: asNullableString(r.quotation_id),
    invoiceId: asNullableString(r.invoice_id),
    method: asNullableString(r.method) as PaymentMethod | null,
    customerName: asNullableString(r.stored_customer_name),
    note: asNullableString(r.note),
    autoReconciled: Boolean(r.auto_reconciled),
    status: String(r.status) as OnboardingPaymentStatus,
    paidAt: r.paid_at == null ? null : asDate(r.paid_at),
    createdAt: asDate(r.created_at),
    updatedAt: asDate(r.updated_at),
  };
}

function toRow(r: Row): PaymentHistoryRow {
  return {
    payment: toPayment(r),
    customerName: String(r.customer_name),
    quotationNumber: asNullableString(r.quotation_number),
    invoiceNumber: asNullableString(r.invoice_number),
    productName: String(r.product_name),
  };
}

function toTenantRow(r: Row): TenantPaymentRow {
  return { ...toRow(r), isRenewal: Boolean(r.is_renewal) };
}

@Injectable()
export class MikroPaymentHistoryRepository implements PaymentHistoryRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async connection() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection();
  }

  async list(filter: PaymentHistoryFilter) {
    const connection = await this.connection();
    const where = listWhere(filter);

    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${SOURCE} ${where.sql}`,
      where.params,
    );
    const rows = await connection.execute<Row[]>(
      `select x.* ${SOURCE} ${where.sql}
        order by x.created_at desc, x.id desc limit ? offset ?`,
      [...where.params, filter.limit, (filter.page - 1) * filter.limit],
    );
    return { items: rows.map(toRow), total: Number(counted[0]?.total ?? 0) };
  }

  async findById(id: string): Promise<PaymentHistoryRow | null> {
    const connection = await this.connection();
    const rows = await connection.execute<Row[]>(
      `select x.* ${SOURCE} where x.id = ? limit 1`,
      [id],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listForTenant(filter: TenantPaymentFilter) {
    const connection = await this.connection();
    const where = tenantWhere(filter);
    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${SOURCE} ${where.sql}`,
      where.params,
    );
    const rows = await connection.execute<Row[]>(
      `select x.* ${SOURCE} ${where.sql}
        order by coalesce(x.paid_at, x.created_at) desc, x.id desc limit ? offset ?`,
      [...where.params, filter.limit, (filter.page - 1) * filter.limit],
    );
    return { items: rows.map(toTenantRow), total: Number(counted[0]?.total ?? 0) };
  }

  async findForTenant(tenantId: string, id: string): Promise<TenantPaymentRow | null> {
    const connection = await this.connection();
    const rows = await connection.execute<Row[]>(
      `select x.* ${SOURCE} where x.id = ? and x.owner_tenant_id = ? limit 1`,
      [id, tenantId],
    );
    return rows[0] ? toTenantRow(rows[0]) : null;
  }

  async listPaidForTenant(tenantId: string): Promise<TenantPaidAmount[]> {
    const connection = await this.connection();
    const rows = await connection.execute<Row[]>(
      `select x.id, x.reference, x.paid_at, x.amount_kobo ${SOURCE}
        where x.owner_tenant_id = ? and x.status = 'paid' and x.paid_at is not null
        order by x.paid_at, x.id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      paidAt: asDate(row.paid_at),
      amountKobo: Number(row.amount_kobo),
    }));
  }
}
