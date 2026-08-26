import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  CustomerInvoice,
  INVOICE_STATUSES,
  isInvoiceStatus,
  type InvoiceSettingsSnapshot,
  type InvoiceStatus,
} from "../../domain/entities/customer-invoice.entity";
import type {
  CustomerInvoiceRepository,
  InvoiceFilters,
  InvoicePage,
} from "../../domain/repositories/customer-invoice.repository";
import {
  CustomerInvoiceRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroCustomerInvoiceRepository implements CustomerInvoiceRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(invoice: CustomerInvoice): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().upsert(CustomerInvoiceRecord, {
      id: invoice.id,
      tenantId: invoice.tenantId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      customerName: invoice.customerName,
      origin: invoice.origin,
      destination: invoice.destination,
      vehicleRegistration: invoice.vehicleRegistration,
      subtotalKobo: invoice.subtotalKobo,
      taxKobo: invoice.taxKobo,
      totalKobo: invoice.totalKobo,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt ? new Date(invoice.issuedAt) : null,
      dueAt: invoice.dueAt ? new Date(invoice.dueAt) : null,
      sentTo: invoice.sentTo,
      sentAt: invoice.sentAt ? new Date(invoice.sentAt) : null,
      paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
      paymentReference: invoice.paymentReference,
      settingsSnapshot: invoice.settingsSnapshot as unknown as Record<string, unknown>,
      createdAt: new Date(invoice.createdAt),
      updatedAt: new Date(invoice.updatedAt),
    });
  }

  async findById(id: string, tenantId: string): Promise<CustomerInvoice | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(CustomerInvoiceRecord, { id, tenantId });
    return record ? toDomain(record) : null;
  }

  async search(filters: InvoiceFilters): Promise<InvoicePage> {
    const orm = await getFleetOrm(this.config.db);
    const where: Record<string, unknown> = { tenantId: filters.tenantId };
    if (filters.status) where.status = filters.status;

    const query = filters.query?.trim();
    if (query) {
      const like = { $ilike: `%${query}%` };
      where.$or = [
        { invoiceNumber: like },
        { customerName: like },
        { origin: like },
        { destination: like },
      ];
    }

    const [records, total] = await orm.em.fork().findAndCount(CustomerInvoiceRecord, where, {
      orderBy: { createdAt: "desc" },
      limit: filters.limit,
      offset: filters.offset,
    });

    return { items: records.map(toDomain), total };
  }

  async countByStatus(tenantId: string): Promise<Record<InvoiceStatus, number>> {
    const orm = await getFleetOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ status: string; total: string }>>(
      `select status, count(*) as total
         from fleet_customer_invoices
        where tenant_id = ?
        group by status`,
      [tenantId],
    );

    const counts = Object.fromEntries(
      INVOICE_STATUSES.map((status) => [status, 0]),
    ) as Record<InvoiceStatus, number>;
    for (const row of rows) {
      if (isInvoiceStatus(row.status)) counts[row.status] = Number(row.total);
    }
    return counts;
  }

  async allocateNumber(
    tenantId: string,
    series: "invoice" | "draft",
    year: number,
  ): Promise<number> {
    const orm = await getFleetOrm(this.config.db);
    // One statement does the insert, the increment and the read, so two people
    // generating an invoice at the same moment cannot receive the same number
    // and nothing between them can leave a gap.
    const rows = await orm.em.getConnection().execute<Array<{ allocated: string }>>(
      `insert into fleet_invoice_number_sequences (tenant_id, series, year, next_value)
         values (?, ?, ?, 2)
       on conflict (tenant_id, series, year)
         do update set next_value = fleet_invoice_number_sequences.next_value + 1
       returning next_value - 1 as allocated`,
      [tenantId, series, year],
    );

    const allocated = Number(rows[0]?.allocated ?? 0);
    if (!allocated) throw new Error("Failed to allocate an invoice number");
    return allocated;
  }
}

function toDomain(record: CustomerInvoiceRecord): CustomerInvoice {
  return CustomerInvoice.create({
    id: record.id,
    tenantId: record.tenantId,
    invoiceNumber: record.invoiceNumber,
    status: isInvoiceStatus(record.status) ? record.status : "draft",
    customerName: record.customerName,
    origin: record.origin ?? null,
    destination: record.destination ?? null,
    vehicleRegistration: record.vehicleRegistration ?? null,
    subtotalKobo: Number(record.subtotalKobo),
    taxKobo: Number(record.taxKobo),
    totalKobo: Number(record.totalKobo),
    currency: record.currency ?? "NGN",
    issuedAt: record.issuedAt?.toISOString() ?? null,
    dueAt: record.dueAt ? record.dueAt.toISOString().slice(0, 10) : null,
    sentTo: record.sentTo ?? null,
    sentAt: record.sentAt?.toISOString() ?? null,
    paidAt: record.paidAt?.toISOString() ?? null,
    paymentReference: record.paymentReference ?? null,
    settingsSnapshot: record.settingsSnapshot as unknown as InvoiceSettingsSnapshot,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
