import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/core';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { OnboardingApplicantType } from '@auth/onboarding/domain/onboarding-application.repository';
import type {
  InvoiceListFilter,
  InvoiceListRow,
  InvoiceRepository,
  InvoiceStatus,
  InvoiceWithLines,
  StoredInvoice,
  StoredInvoiceLine,
} from '@auth/onboarding/domain/invoice.repository';

type Row = Record<string, unknown>;

const HEADER_COLUMNS = `i.id, i.number, i.prefix, i.year, i.sequence, i.quotation_id,
  i.application_id, i.tenant_id, i.customer_name, i.customer_type, i.billing_email,
  i.status, to_char(i.issue_date, 'YYYY-MM-DD') as issue_date,
  to_char(i.due_date, 'YYYY-MM-DD') as due_date, i.subtotal_kobo, i.discount_kobo,
  i.tax_rate_bp, i.tax_kobo, i.total_kobo, i.amount_paid_kobo, i.emailed_at,
  i.created_at, i.updated_at`;

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
  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const LIST_SOURCE = `from (
  select ${HEADER_COLUMNS}, q.number as quotation_number,
    case when i.status in ('issued', 'partially_paid')
              and i.due_date < ?::date and i.total_kobo > i.amount_paid_kobo
         then 'overdue' else i.status end as effective_status
  from billing_invoices i
  left join billing_quotations q on q.id = i.quotation_id
) x`;

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
    await em.transactional(async (tx) => {
      const connection = tx.getConnection();
      const ctx = tx.getTransactionContext();
      // The lock comes first so the sum below is read after any concurrent
      // settlement has committed, not before it.
      await connection.execute(
        'select id from billing_invoices where id = ? for update',
        [invoiceId],
        'all',
        ctx,
      );
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
    });
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
