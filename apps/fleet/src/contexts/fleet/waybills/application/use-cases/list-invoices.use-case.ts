import { Inject, Injectable } from "@nestjs/common";
import type { CustomerInvoice } from "../../domain/entities/customer-invoice.entity";
import {
  CUSTOMER_INVOICE_REPOSITORY,
  type CustomerInvoiceRepository,
  type InvoiceFilters,
} from "../../domain/repositories/customer-invoice.repository";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class ListInvoicesUseCase {
  constructor(
    @Inject(CUSTOMER_INVOICE_REPOSITORY) private readonly invoices: CustomerInvoiceRepository,
  ) {}

  async execute(filters: InvoiceFilters, now = new Date()) {
    const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [page, counts] = await Promise.all([
      this.invoices.search({ ...filters, limit, offset }),
      this.invoices.countByStatus(filters.tenantId),
    ]);

    return {
      summary: {
        totalInvoices: Object.values(counts).reduce((sum, count) => sum + count, 0),
        // "Pending" is anything not yet settled, which is every status before paid.
        pendingInvoices:
          counts.draft + counts.pending_review + counts.approved + counts.sent,
        pendingReview: counts.pending_review,
        approvedInvoices: counts.approved + counts.sent + counts.paid,
      },
      invoices: page.items.map((invoice) => toInvoiceRow(invoice, now)),
      page: { total: page.total, limit, offset },
    };
  }
}

export function toInvoiceRow(invoice: CustomerInvoice, now = new Date()) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.displayStatus(now),
    customerName: invoice.customerName,
    origin: invoice.origin,
    destination: invoice.destination,
    vehicleRegistration: invoice.vehicleRegistration,
    subtotalKobo: invoice.subtotalKobo,
    taxKobo: invoice.taxKobo,
    totalKobo: invoice.totalKobo,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    sentTo: invoice.sentTo,
    sentAt: invoice.sentAt,
    paidAt: invoice.paidAt,
    paymentReference: invoice.paymentReference,
    createdAt: invoice.createdAt,
  };
}
