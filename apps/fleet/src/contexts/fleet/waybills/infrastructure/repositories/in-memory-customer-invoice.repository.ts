import { Injectable } from "@nestjs/common";
import {
  INVOICE_STATUSES,
  type CustomerInvoice,
  type InvoiceStatus,
} from "../../domain/entities/customer-invoice.entity";
import type {
  CustomerInvoiceRepository,
  InvoiceFilters,
  InvoicePage,
} from "../../domain/repositories/customer-invoice.repository";

@Injectable()
export class InMemoryCustomerInvoiceRepository implements CustomerInvoiceRepository {
  private readonly data = new Map<string, CustomerInvoice>();
  private readonly sequences = new Map<string, number>();

  async save(invoice: CustomerInvoice): Promise<void> {
    this.data.set(invoice.id, invoice);
  }

  async findById(id: string, tenantId: string): Promise<CustomerInvoice | null> {
    const invoice = this.data.get(id);
    if (!invoice || invoice.tenantId !== tenantId) return null;
    return invoice;
  }

  async search(filters: InvoiceFilters): Promise<InvoicePage> {
    const query = filters.query?.trim().toLowerCase();
    const matched = [...this.data.values()]
      .filter((invoice) => {
        if (invoice.tenantId !== filters.tenantId) return false;
        if (filters.status && invoice.status !== filters.status) return false;
        if (!query) return true;
        return [
          invoice.invoiceNumber,
          invoice.customerName,
          invoice.origin ?? "",
          invoice.destination ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? matched.length;
    return { items: matched.slice(offset, offset + limit), total: matched.length };
  }

  async countByStatus(tenantId: string): Promise<Record<InvoiceStatus, number>> {
    const counts = Object.fromEntries(
      INVOICE_STATUSES.map((status) => [status, 0]),
    ) as Record<InvoiceStatus, number>;

    for (const invoice of this.data.values()) {
      if (invoice.tenantId !== tenantId) continue;
      counts[invoice.status] += 1;
    }
    return counts;
  }

  async allocateNumber(
    tenantId: string,
    series: "invoice" | "draft",
    year: number,
  ): Promise<number> {
    const key = `${tenantId}:${series}:${year}`;
    const next = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, next);
    return next;
  }
}
