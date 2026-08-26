import type { CustomerInvoice, InvoiceStatus } from "../entities/customer-invoice.entity";

export type InvoiceFilters = {
  tenantId: string;
  status?: InvoiceStatus;
  /** Matches invoice number, customer or route. */
  query?: string;
  limit?: number;
  offset?: number;
};

export type InvoicePage = {
  items: CustomerInvoice[];
  total: number;
};

export interface CustomerInvoiceRepository {
  save(invoice: CustomerInvoice): Promise<void>;
  findById(id: string, tenantId: string): Promise<CustomerInvoice | null>;
  search(filters: InvoiceFilters): Promise<InvoicePage>;
  countByStatus(tenantId: string): Promise<Record<InvoiceStatus, number>>;
  /**
   * Takes the next number in a series for one tenant.
   *
   * Must not repeat a number or skip one, and must be safe when two people
   * generate an invoice at the same moment.
   */
  allocateNumber(tenantId: string, series: "invoice" | "draft", year: number): Promise<number>;
}

export const CUSTOMER_INVOICE_REPOSITORY = Symbol("CUSTOMER_INVOICE_REPOSITORY");
