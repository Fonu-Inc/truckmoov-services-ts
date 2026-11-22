import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import type { OnboardingApplicantType } from '@auth/onboarding/domain/onboarding-application.repository';
import type {
  InvoiceListFilter,
  InvoiceListRow,
  InvoiceRepository,
  InvoiceStatus,
  InvoiceWithLines,
  RenewalAmounts,
  StoredInvoice,
  StoredInvoiceLine,
  TenantInvoiceFact,
  TenantInvoiceFilter,
  TenantInvoicePage,
  TenantInvoiceRow,
} from '@auth/onboarding/domain/invoice.repository';

type Row = Record<string, unknown>;

const HEADER_COLUMNS = `i.id, i.number, i.prefix, i.year, i.sequence, i.quotation_id,
  i.application_id, i.tenant_id, i.customer_name, i.customer_type, i.billing_email,
  i.status, to_char(i.issue_date, 'YYYY-MM-DD') as issue_date,
  to_char(i.due_date, 'YYYY-MM-DD') as due_date, i.subtotal_kobo, i.discount_kobo,
  i.tax_rate_bp, i.tax_kobo, i.total_kobo, i.amount_paid_kobo, i.emailed_at,
  i.created_at, i.updated_at`;

const RENEWAL_LINE = `exists (select 1 from billing_invoice_lines l
  where l.invoice_id = i.id and l.kind = 'plan' and l.is_renewal)`;

const OPEN_STATUSES = `('issued', 'partially_paid', 'overdue')`;

const asDate = (value: unknown) => new Date(value as string | number | Date);
const asNullableString = (value: unknown) => (value == null ? null : String(value));

export function toInvoice(r: Row): StoredInvoice {
  return {
    id: String(r.id),
    number: String(r.number),
    prefix: String(r.prefix),
    year: Number(r.year),
    sequence: Number(r.sequence),
    quotationId: asNullableString(r.quotation_id),
    applicationId: asNullableString(r.application_id),
    tenantId: asNullableString(r.tenant_id),
    customerName: String(r.customer_name),
    customerType: String(r.customer_type) as OnboardingApplicantType,
    billingEmail: String(r.billing_email),
    status: String(r.status) as InvoiceStatus,
    issueDate: String(r.issue_date),
    dueDate: String(r.due_date),
    subtotalKobo: Number(r.subtotal_kobo),
    discountKobo: Number(r.discount_kobo),
    taxRateBp: Number(r.tax_rate_bp),
    taxKobo: Number(r.tax_kobo),
    totalKobo: Number(r.total_kobo),
    amountPaidKobo: Number(r.amount_paid_kobo),
    emailedAt: r.emailed_at == null ? null : asDate(r.emailed_at),
    createdAt: asDate(r.created_at),
    updatedAt: asDate(r.updated_at),
  };
}

function toInvoiceLine(r: Row): StoredInvoiceLine {
  return {
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    position: Number(r.position),
    kind: String(r.kind) as StoredInvoiceLine['kind'],
    planCode: asNullableString(r.plan_code),
    name: String(r.name),
    description: asNullableString(r.description),
    quantity: Number(r.quantity),
    unitPriceKobo: Number(r.unit_price_kobo),
    validityDays: r.validity_days == null ? null : Number(r.validity_days),
    components: Array.isArray(r.components) ? r.components.map(String) : null,
    isRenewal: Boolean(r.is_renewal),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function listWhere(filter: InvoiceListFilter) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const needle = filter.q?.trim();
  if (needle) {
    clauses.push(
      `(x.number ilike ? escape '\\' or x.customer_name ilike ? escape '\\' or x.quotation_number ilike ? escape '\\')`,
    );
    const pattern = `%${escapeLike(needle)}%`;
    params.push(pattern, pattern, pattern);
  }
  if (filter.status) {
    clauses.push('x.effective_status = ?');
    params.push(filter.status);
  }
  if (filter.kind) clauses.push(filter.kind === 'renewal' ? 'x.is_renewal' : 'not x.is_renewal');
  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const PLAN_LINE = (column: string) => `(select l.${column} from billing_invoice_lines l
  where l.invoice_id = i.id and l.kind = 'plan' order by l.position, l.id limit 1)`;

const LIST_SOURCE = `from (
  select ${HEADER_COLUMNS}, q.number as quotation_number, ${RENEWAL_LINE} as is_renewal,
    ${PLAN_LINE('name')} as plan_name, ${PLAN_LINE('quantity')} as plan_quantity,
    case when i.status in ('issued', 'partially_paid')
              and i.due_date < ?::date and i.total_kobo > i.amount_paid_kobo
         then 'overdue' else i.status end as effective_status
  from billing_invoices i
  left join billing_quotations q on q.id = i.quotation_id
) x`;

/** Locks the invoice, then re-derives amount paid and status from its paid payments. */
export async function recomputeInvoicePaid(tx: EntityManager, invoiceId: string): Promise<void> {
  const connection = tx.getConnection();
  const ctx = tx.getTransactionContext();
  // The lock comes first so the sum below is read after any concurrent
  // settlement has committed, not before it.
  await connection.execute('select id from billing_invoices where id = ? for update', [invoiceId], 'all', ctx);
  await connection.execute(
    `update billing_invoices i
        set amount_paid_kobo = s.paid,
            status = case when i.status in ('draft', 'cancelled') then i.status
                          when s.paid >= i.total_kobo then 'paid'
                          when s.paid > 0 then 'partially_paid'
                          else 'issued' end,
            updated_at = now()
       from (select coalesce(sum(p.amount_kobo), 0) as paid
               from onboarding_payments p
               join billing_invoices b on b.id = ?
              where p.status = 'paid'
                and (p.invoice_id = b.id
                     or (b.quotation_id is not null and p.quotation_id = b.quotation_id))) s
      where i.id = ?`,
    [invoiceId, invoiceId],
    'run',
    ctx,
  );
}

const TENANT_SOURCE = `from billing_invoices i
  left join onboarding_applications a on a.id = i.application_id
  where coalesce(i.tenant_id, a.tenant_id) = ?`;

function tenantScopeClause(scope: TenantInvoiceFilter['scope']): string {
  const visible = `and i.status not in ('draft', 'cancelled')`;
  if (scope === 'open') return `${visible} and i.status in ${OPEN_STATUSES} and i.total_kobo > i.amount_paid_kobo`;
  if (scope === 'paid') return `${visible} and i.status = 'paid'`;
  return visible;
}

const TENANT_ROW_COLUMNS = `${HEADER_COLUMNS}, ${RENEWAL_LINE} as is_renewal,
  ${PLAN_LINE('name')} as plan_name, ${PLAN_LINE('quantity')} as plan_quantity,
  ${PLAN_LINE('validity_days')} as plan_validity_days,
  (select q.number from billing_quotations q where q.id = i.quotation_id) as quotation_number`;

const EFFECTIVE_STATUS = `case when i.status in ('issued', 'partially_paid')
    and i.due_date < ?::date and i.total_kobo > i.amount_paid_kobo
  then 'overdue' else i.status end`;

function tenantFilterClause(filter: TenantInvoiceFilter) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const needle = filter.q?.trim();
  if (needle) {
    const pattern = `%${escapeLike(needle)}%`;
    clauses.push(`(i.number ilike ? escape '\\'
      or exists (select 1 from billing_quotations q
                  where q.id = i.quotation_id and q.number ilike ? escape '\\')
      or exists (select 1 from billing_invoice_lines l
                  where l.invoice_id = i.id and l.kind = 'plan' and l.name ilike ? escape '\\')
      or to_char(i.issue_date, 'FMMonth YYYY') ilike ? escape '\\')`);
    params.push(pattern, pattern, pattern, pattern);
  }
  if (filter.state) {
    clauses.push(`(${EFFECTIVE_STATUS}) = ?`);
    params.push(filter.today ?? lagosDate(new Date()), filter.state === 'pending' ? 'issued' : filter.state);
  }
  return { sql: clauses.map((clause) => `and ${clause}`).join(' '), params };
}

function toTenantRow(r: Row): TenantInvoiceRow {
  return {
    invoice: toInvoice(r),
    isRenewal: Boolean(r.is_renewal),
    plan:
      r.plan_name == null
        ? null
        : {
            name: String(r.plan_name),
            quantity: Number(r.plan_quantity),
            validityDays: r.plan_validity_days == null ? null : Number(r.plan_validity_days),
          },
    quotationNumber: asNullableString(r.quotation_number),
  };
}

@Injectable()
export class MikroInvoiceRepository implements InvoiceRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async findByQuotationId(quotationId: string): Promise<InvoiceWithLines | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} from billing_invoices i where i.quotation_id = ? limit 1`,
      [quotationId],
    );
    return rows[0] ? this.withLines(em, toInvoice(rows[0])) : null;
  }

  async createIfAbsent(invoice: InvoiceWithLines) {
    const em = await this.em();
    const created = await em.transactional((tx) => this.insert(tx, invoice));
    if (created) return { invoice, created: true };

    const existing = invoice.quotationId
      ? await this.findByQuotationId(invoice.quotationId)
      : null;
    if (!existing) throw new Error('Invoice insert conflicted without a holder');
    return { invoice: existing, created: false };
  }

  async recomputePaid(invoiceId: string): Promise<void> {
    const em = await this.em();
    await em.transactional((tx) => recomputeInvoicePaid(tx, invoiceId));
  }

  async markEmailed(id: string, at: Date): Promise<boolean> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `update billing_invoices set emailed_at = ?, updated_at = now()
        where id = ? and emailed_at is null returning id`,
      [at, id],
    );
    return rows.length === 1;
  }

  async findById(id: string): Promise<InvoiceWithLines | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} from billing_invoices i where i.id = ? limit 1`,
      [id],
    );
    return rows[0] ? this.withLines(em, toInvoice(rows[0])) : null;
  }

  async findQuotationNumber(invoiceId: string): Promise<string | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select q.number from billing_invoices i
         join billing_quotations q on q.id = i.quotation_id where i.id = ?`,
      [invoiceId],
    );
    return rows[0] ? String(rows[0].number) : null;
  }

  async list(filter: InvoiceListFilter) {
    const em = await this.em();
    const connection = em.getConnection();
    const where = listWhere(filter);

    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${LIST_SOURCE} ${where.sql}`,
      [filter.today, ...where.params],
    );
    const rows = await connection.execute<Row[]>(
      `select x.* ${LIST_SOURCE} ${where.sql}
        order by x.created_at desc, x.id desc limit ? offset ?`,
      [filter.today, ...where.params, filter.limit, (filter.page - 1) * filter.limit],
    );

    const items: InvoiceListRow[] = rows.map((row) => ({
      invoice: toInvoice(row),
      quotationNumber: asNullableString(row.quotation_number),
      isRenewal: Boolean(row.is_renewal),
      productName: asNullableString(row.plan_name),
      deviceCount: Number(row.plan_quantity ?? 0),
    }));
    return { items, total: Number(counted[0]?.total ?? 0) };
  }

  async countOverdue(today: string): Promise<number> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select count(*) as total from billing_invoices
        where status in ('issued', 'partially_paid')
          and due_date < ?::date and total_kobo > amount_paid_kobo`,
      [today],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async countOverdueByTenant(today: string): Promise<Map<string, number>> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select tenant_id, count(*)::int as total
         from billing_invoices
        where tenant_id is not null
          and status in ('issued', 'partially_paid')
          and due_date < ?::date
          and total_kobo > amount_paid_kobo
        group by tenant_id`,
      [today],
    );
    return new Map(
      rows.map((row) => [String(row.tenant_id), Number(row.total ?? 0)]),
    );
  }

  async createRenewal(invoice: InvoiceWithLines, periodId: string) {
    const em = await this.em();
    const created = await em.transactional(async (tx) => {
      const connection = tx.getConnection();
      const ctx = tx.getTransactionContext();
      const period = await connection.execute<Row[]>(
        `select renewal_invoice_id from tenant_licence_periods
          where id = ? and status = 'active' for update`,
        [periodId],
        'all',
        ctx,
      );
      if (!period[0] || period[0].renewal_invoice_id != null) return false;
      if (!(await this.insert(tx, invoice))) throw new Error('Renewal invoice number is already taken');
      await connection.execute(
        `update tenant_licence_periods set renewal_invoice_id = ?, updated_at = now() where id = ?`,
        [invoice.id, periodId],
        'run',
        ctx,
      );
      return true;
    });
    return { invoice: created ? invoice : null, created };
  }

  async listOpenRenewals(): Promise<InvoiceWithLines[]> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} from billing_invoices i
        where i.status = 'issued' and i.amount_paid_kobo = 0 and i.tenant_id is not null
          and i.quotation_id is null and ${RENEWAL_LINE}
        order by i.due_date, i.id`,
    );
    return Promise.all(rows.map((row) => this.withLines(em, toInvoice(row))));
  }

  async cancelRenewal(id: string): Promise<boolean> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `update billing_invoices i set status = 'cancelled', updated_at = now()
        where i.id = ? and i.status = 'issued' and i.amount_paid_kobo = 0 and ${RENEWAL_LINE}
        returning i.id`,
      [id],
    );
    return rows.length === 1;
  }

  async updateRenewalAmounts(id: string, amounts: RenewalAmounts): Promise<boolean> {
    const em = await this.em();
    return em.transactional(async (tx) => {
      const connection = tx.getConnection();
      const ctx = tx.getTransactionContext();
      const locked = await connection.execute<Row[]>(
        `select id from billing_invoices i
          where i.id = ? and i.status = 'issued' and i.amount_paid_kobo = 0 for update`,
        [id],
        'all',
        ctx,
      );
      if (locked.length === 0) return false;
      await connection.execute(
        `update billing_invoice_lines set quantity = ?, unit_price_kobo = ?
          where invoice_id = ? and kind = 'plan' and is_renewal`,
        [amounts.quantity, amounts.unitPriceKobo, id],
        'run',
        ctx,
      );
      await connection.execute(
        `update billing_invoices
            set subtotal_kobo = ?, tax_rate_bp = ?, tax_kobo = ?, total_kobo = ?, updated_at = now()
          where id = ?`,
        [amounts.subtotalKobo, amounts.taxRateBp, amounts.taxKobo, amounts.totalKobo, id],
        'run',
        ctx,
      );
      return true;
    });
  }

  async listForTenant(filter: TenantInvoiceFilter): Promise<TenantInvoicePage> {
    const em = await this.em();
    const connection = em.getConnection();
    const scope = tenantScopeClause(filter.scope);
    const narrowed = tenantFilterClause(filter);
    const params = [filter.tenantId, ...narrowed.params];
    const rows = await connection.execute<Row[]>(
      `select ${TENANT_ROW_COLUMNS} ${TENANT_SOURCE} ${scope} ${narrowed.sql}
        order by i.due_date desc, i.id desc limit ? offset ?`,
      [...params, filter.limit, (filter.page - 1) * filter.limit],
    );
    const counted = await connection.execute<Row[]>(
      `select count(*) as total ${TENANT_SOURCE} ${scope} ${narrowed.sql}`,
      params,
    );
    const open = await connection.execute<Row[]>(
      `select coalesce(sum(i.total_kobo - i.amount_paid_kobo), 0) as open_kobo,
              to_char(min(i.due_date), 'YYYY-MM-DD') as next_due
         ${TENANT_SOURCE} ${tenantScopeClause('open')}`,
      [filter.tenantId],
    );
    return {
      items: rows.map(toTenantRow),
      total: Number(counted[0]?.total ?? 0),
      openTotalKobo: Number(open[0]?.open_kobo ?? 0),
      nextDueDate: asNullableString(open[0]?.next_due),
    };
  }

  async findForTenant(tenantId: string, id: string) {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS}, ${RENEWAL_LINE} as is_renewal ${TENANT_SOURCE}
          and i.id = ? and i.status not in ('draft', 'cancelled') limit 1`,
      [tenantId, id],
    );
    if (!rows[0]) return null;
    const invoice = await this.withLines(em, toInvoice(rows[0]));
    return { ...invoice, isRenewal: Boolean(rows[0].is_renewal) };
  }

  async findLatestPaidPlanInvoice(tenantId: string): Promise<InvoiceWithLines | null> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select ${HEADER_COLUMNS} ${TENANT_SOURCE} and i.status = 'paid'
          and exists (select 1 from billing_invoice_lines l where l.invoice_id = i.id and l.kind = 'plan')
        order by i.issue_date desc, i.created_at desc, i.id desc limit 1`,
      [tenantId],
    );
    return rows[0] ? this.withLines(em, toInvoice(rows[0])) : null;
  }

  async listFactsForTenant(tenantId: string): Promise<TenantInvoiceFact[]> {
    const em = await this.em();
    const rows = await em.getConnection().execute<Row[]>(
      `select i.id, i.number, to_char(i.issue_date, 'YYYY-MM-DD') as issue_date, i.created_at,
              i.total_kobo, i.amount_paid_kobo,
              coalesce((select sum(l.quantity * l.unit_price_kobo) from billing_invoice_lines l
                         where l.invoice_id = i.id and l.kind = 'plan'), 0) as licensing_kobo,
              coalesce((select sum(l.quantity * l.unit_price_kobo) from billing_invoice_lines l
                         where l.invoice_id = i.id and l.kind = 'installation'), 0) as installation_kobo
         ${TENANT_SOURCE} ${tenantScopeClause('all')}
        order by i.issue_date, i.created_at, i.id`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      number: String(row.number),
      issueDate: String(row.issue_date),
      createdAt: asDate(row.created_at),
      totalKobo: Number(row.total_kobo),
      amountPaidKobo: Number(row.amount_paid_kobo),
      licensingKobo: Number(row.licensing_kobo),
      installationKobo: Number(row.installation_kobo),
    }));
  }

  private async insert(tx: EntityManager, inv: InvoiceWithLines): Promise<boolean> {
    const connection = tx.getConnection();
    const ctx = tx.getTransactionContext();
    const inserted = await connection.execute<Row[]>(
      `insert into billing_invoices
         (id, number, prefix, year, sequence, quotation_id, application_id, tenant_id,
          customer_name, customer_type, billing_email, status, issue_date, due_date,
          subtotal_kobo, discount_kobo, tax_rate_bp, tax_kobo, total_kobo,
          amount_paid_kobo, emailed_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict do nothing returning id`,
      [
        inv.id, inv.number, inv.prefix, inv.year, inv.sequence, inv.quotationId,
        inv.applicationId, inv.tenantId, inv.customerName, inv.customerType,
        inv.billingEmail, inv.status, inv.issueDate, inv.dueDate, inv.subtotalKobo,
        inv.discountKobo, inv.taxRateBp, inv.taxKobo, inv.totalKobo,
        inv.amountPaidKobo, inv.emailedAt, inv.createdAt, inv.updatedAt,
      ],
      'all',
      ctx,
    );
    if (inserted.length === 0) return false;

    for (const line of inv.lines) {
      await connection.execute(
        `insert into billing_invoice_lines
           (id, invoice_id, position, kind, plan_code, name, description, quantity,
            unit_price_kobo, validity_days, components, is_renewal)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
        [
          line.id, line.invoiceId, line.position, line.kind, line.planCode,
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

  private async withLines(em: EntityManager, invoice: StoredInvoice): Promise<InvoiceWithLines> {
    const rows = await em.getConnection().execute<Row[]>(
      `select id, invoice_id, position, kind, plan_code, name, description, quantity,
              unit_price_kobo, validity_days, components, is_renewal
         from billing_invoice_lines where invoice_id = ? order by position asc, id asc`,
      [invoice.id],
    );
    return { ...invoice, lines: rows.map(toInvoiceLine) };
  }
}
