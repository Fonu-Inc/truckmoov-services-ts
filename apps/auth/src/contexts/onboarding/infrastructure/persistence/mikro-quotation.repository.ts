import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { OnboardingApplicantType } from '@auth/onboarding/domain/onboarding-application.repository';
import type {
  QuotationKey,
  QuotationListFilter,
  QuotationListRow,
  QuotationRepository,
  QuotationStatus,
  QuotationWithLines,
  StoredQuotation,
  StoredQuotationLine,
  TenantQuotationFilter,
  TenantQuotationRow,
} from '@auth/onboarding/domain/quotation.repository';

type Row = Record<string, unknown>;

const HEADER_COLUMNS = `id, number, prefix, year, sequence, application_id, tenant_id,
  plan_code, device_count, customer_name, customer_type, billing_email, status,
  subtotal_kobo, discount_kobo, tax_rate_bp, tax_kobo, total_kobo, valid_until,
  sent_at, accepted_at, created_at, updated_at`;

const asDate = (value: unknown) => new Date(value as string | number | Date);
const asNullableDate = (value: unknown) => (value == null ? null : asDate(value));
const asNullableString = (value: unknown) => (value == null ? null : String(value));

export function toQuotation(r: Row): StoredQuotation {
  return {
    id: String(r.id),
    number: String(r.number),
    prefix: String(r.prefix),
    year: Number(r.year),
    sequence: Number(r.sequence),
    applicationId: asNullableString(r.application_id),
    tenantId: asNullableString(r.tenant_id),
    planCode: String(r.plan_code),
    deviceCount: Number(r.device_count),
    customerName: String(r.customer_name),
    customerType: String(r.customer_type) as OnboardingApplicantType,
    billingEmail: String(r.billing_email),
    status: String(r.status) as QuotationStatus,
    subtotalKobo: Number(r.subtotal_kobo),
    discountKobo: Number(r.discount_kobo),
    taxRateBp: Number(r.tax_rate_bp),
    taxKobo: Number(r.tax_kobo),
    totalKobo: Number(r.total_kobo),
    validUntil: asDate(r.valid_until),
    sentAt: asNullableDate(r.sent_at),
    acceptedAt: asNullableDate(r.accepted_at),
    createdAt: asDate(r.created_at),
    updatedAt: asDate(r.updated_at),
  };
}

export function toQuotationLine(r: Row): StoredQuotationLine {
  const components = Array.isArray(r.components) ? r.components.map(String) : null;
  return {
    id: String(r.id),
    quotationId: String(r.quotation_id),
    position: Number(r.position),
    kind: String(r.kind) as StoredQuotationLine['kind'],
    planCode: asNullableString(r.plan_code),
    name: String(r.name),
    description: asNullableString(r.description),
    quantity: Number(r.quantity),
    unitPriceKobo: Number(r.unit_price_kobo),
    validityDays: r.validity_days == null ? null : Number(r.validity_days),
    components,
    isRenewal: Boolean(r.is_renewal),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function listWhere(filter: QuotationListFilter) {
  const effective = `case when x.status not in ('accepted','cancelled') and (x.status = 'expired' or x.valid_until < ?) then 'expired' else x.status end`;
  const clauses: string[] = [];
  const params: unknown[] = [];

  const needle = filter.q?.trim();
  if (needle) {
    clauses.push(`(x.number ilike ? escape '\\' or x.customer_name ilike ? escape '\\')`);
    const pattern = `%${escapeLike(needle)}%`;
    params.push(pattern, pattern);
  }
  if (filter.status) {
    clauses.push(`(${effective}) = ?`);
    params.push(filter.now, filter.status);
  }
  if (filter.paymentStatus === 'complete') clauses.push('x.paid_kobo >= x.total_kobo');
  if (filter.paymentStatus === 'incomplete') clauses.push('x.paid_kobo < x.total_kobo');

  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const LIST_SOURCE = `from (
  select q.*,
    coalesce((select sum(p.amount_kobo) from onboarding_payments p
               where p.quotation_id = q.id and p.status = 'paid'), 0) as paid_kobo,
    (select count(*) from billing_quotation_lines l where l.quotation_id = q.id) as line_count
  from billing_quotations q
) x`;

const TENANT_SOURCE = `from (
  select q.*, a.reference as application_reference,
    coalesce((select sum(p.amount_kobo) from onboarding_payments p
               where p.quotation_id = q.id and p.status = 'paid'), 0) as paid_kobo,
    (select p.reference from onboarding_payments p
      where p.quotation_id = q.id and p.status = 'paid'
      order by p.paid_at desc nulls last, p.id limit 1) as payment_reference,
    case when q.status not in ('accepted', 'cancelled') and (q.status = 'expired' or q.valid_until < ?)
         then 'expired' else q.status end as effective_status
  from billing_quotations q
  left join onboarding_applications a on a.id = q.application_id
  where coalesce(q.tenant_id, a.tenant_id) = ? and q.status not in ('draft', 'pending_review')
) x`;

const TENANT_STATUS = `case when x.effective_status = 'accepted'
    then (case when x.paid_kobo >= x.total_kobo then 'paid' else 'accepted' end)
  when x.effective_status in ('expired', 'cancelled') then x.effective_status
  else 'awaiting_decision' end`;

function tenantWhere(filter: TenantQuotationFilter) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const needle = filter.q?.trim();
  if (needle) {
    const pattern = `%${escapeLike(needle)}%`;
    clauses.push(`(x.number ilike ? escape '\\' or x.application_reference ilike ? escape '\\'
      or exists (select 1 from billing_quotation_lines l
                  where l.quotation_id = x.id and l.name ilike ? escape '\\'))`);
    params.push(pattern, pattern, pattern);
  }
  if (filter.status) {
    clauses.push(`(${TENANT_STATUS}) = ?`);
    params.push(filter.status);
  }
  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

@Injectable()
export class MikroQuotationRepository implements QuotationRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async findActiveByKey(key: QuotationKey): Promise<QuotationWithLines | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} from billing_quotations
        where application_id = ? and plan_code = ? and device_count = ?
          and total_kobo = ? and status <> 'cancelled' limit 1`,
      [key.applicationId, key.planCode, key.deviceCount, key.totalKobo],
    );
    return rows[0] ? this.withLines(em, toQuotation(rows[0])) : null;
  }

  async createIfAbsent(quotation: QuotationWithLines) {
    const em = await this.em();
    const created = await em.transactional((tx) => this.insert(tx, quotation));
    if (created) return { quotation, created: true };

    const existing = await this.findActiveByKey({
      applicationId: quotation.applicationId ?? '',
      planCode: quotation.planCode,
      deviceCount: quotation.deviceCount,
      totalKobo: quotation.totalKobo,
    });
    if (!existing) throw new Error('Quotation insert conflicted without a holder');
    return { quotation: existing, created: false };
  }

  async extendValidity(id: string, validUntil: Date, now: Date): Promise<boolean> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `update billing_quotations
          set valid_until = ?, updated_at = now()
        where id = ? and status = 'sent' and valid_until < ?
        returning id`,
      [validUntil, id, now],
    );
    return rows.length === 1;
  }

  async markAccepted(id: string, at: Date): Promise<boolean> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `update billing_quotations
          set status = 'accepted', accepted_at = ?, updated_at = now()
        where id = ? and status not in ('accepted', 'cancelled')
        returning id`,
      [at, id],
    );
    return rows.length === 1;
  }

  async findById(id: string): Promise<QuotationWithLines | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} from billing_quotations where id = ? limit 1`,
      [id],
    );
    return rows[0] ? this.withLines(em, toQuotation(rows[0])) : null;
  }

  async list(filter: QuotationListFilter) {
    const em = await this.em();
    const connection = em.getConnection();
    const where = listWhere(filter);

    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${LIST_SOURCE} ${where.sql}`,
      where.params,
    );
    const rows = await connection.execute<Row[]>(
      `select x.* ${LIST_SOURCE} ${where.sql}
        order by x.created_at desc, x.id desc limit ? offset ?`,
      [...where.params, filter.limit, (filter.page - 1) * filter.limit],
    );

    const items: QuotationListRow[] = rows.map((row) => ({
      quotation: toQuotation(row),
      paidKobo: Number(row.paid_kobo),
      lineCount: Number(row.line_count),
    }));
    return { items, total: Number(counted[0]?.total ?? 0) };
  }

  private async insert(tx: EntityManager, q: QuotationWithLines): Promise<boolean> {
    const connection = tx.getConnection();
    const ctx = tx.getTransactionContext();
    const inserted = await connection.execute<Row[]>(
      `insert into billing_quotations (${HEADER_COLUMNS})
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict do nothing returning id`,
      [
        q.id, q.number, q.prefix, q.year, q.sequence, q.applicationId, q.tenantId,
        q.planCode, q.deviceCount, q.customerName, q.customerType, q.billingEmail,
        q.status, q.subtotalKobo, q.discountKobo, q.taxRateBp, q.taxKobo,
        q.totalKobo, q.validUntil, q.sentAt, q.acceptedAt, q.createdAt, q.updatedAt,
      ],
      'all',
      ctx,
    );
    if (inserted.length === 0) return false;

    for (const line of q.lines) {
      await connection.execute(
        `insert into billing_quotation_lines
           (id, quotation_id, position, kind, plan_code, name, description, quantity,
            unit_price_kobo, validity_days, components, is_renewal)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
        [
          line.id, line.quotationId, line.position, line.kind, line.planCode,
          line.name, line.description, line.quantity, line.unitPriceKobo,
          line.validityDays,
          line.components ? JSON.stringify(line.components) : null,
          line.isRenewal,
        ],
        'run',
        ctx,
      );
    }
    return true;
  }

  private async withLines(
    em: EntityManager,
    quotation: StoredQuotation,
  ): Promise<QuotationWithLines> {
    const rows = await em.getConnection().execute<Row[]>(
      `select id, quotation_id, position, kind, plan_code, name, description, quantity,
              unit_price_kobo, validity_days, components, is_renewal
         from billing_quotation_lines where quotation_id = ? order by position asc, id asc`,
      [quotation.id],
    );
    return { ...quotation, lines: rows.map(toQuotationLine) };
  }

  async listForTenant(filter: TenantQuotationFilter) {
    const em = await this.em();
    const connection = em.getConnection();
    const where = tenantWhere(filter);
    const base = [filter.now, filter.tenantId, ...where.params];

    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${TENANT_SOURCE} ${where.sql}`,
      base,
    );
    const rows = await connection.execute<Row[]>(
      `select x.* ${TENANT_SOURCE} ${where.sql}
        order by x.created_at desc, x.id desc limit ? offset ?`,
      [...base, filter.limit, (filter.page - 1) * filter.limit],
    );
    return { items: await this.tenantRows(em, rows), total: Number(counted[0]?.total ?? 0) };
  }

  async findForTenant(tenantId: string, id: string, now: Date) {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select x.* ${TENANT_SOURCE} where x.id = ? limit 1`,
      [now, tenantId, id],
    );
    return (await this.tenantRows(em, rows))[0] ?? null;
  }

  private async tenantRows(em: EntityManager, rows: Row[]): Promise<TenantQuotationRow[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => String(row.id));
    const lines = await em.getConnection().execute<Row[]>(
      `select id, quotation_id, position, kind, plan_code, name, description, quantity,
              unit_price_kobo, validity_days, components, is_renewal
         from billing_quotation_lines where quotation_id in (${ids.map(() => '?').join(', ')})
        order by position asc, id asc`,
      ids,
    );
    return rows.map((row) => ({
      quotation: toQuotation(row),
      lines: lines.filter((line: Row) => String(line.quotation_id) === String(row.id)).map(toQuotationLine),
      paidKobo: Number(row.paid_kobo),
      applicationReference: asNullableString(row.application_reference),
      paymentReference: asNullableString(row.payment_reference),
    }));
  }
}
