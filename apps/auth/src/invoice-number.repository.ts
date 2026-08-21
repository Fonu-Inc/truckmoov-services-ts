/**
 * Three separate invoice series exist across the product, and conflating any
 * two of them causes real confusion. Each keeps its own counter.
 *
 * - `platform_subscription` — what the platform bills a tenant for its plan
 * - `platform_usage` — what the platform bills a tenant for postpaid usage
 * - `tenant_customer` — what a tenant bills its own customer, from a waybill
 */
export const INVOICE_SERIES = [
  'platform_subscription',
  'platform_usage',
  'tenant_customer',
] as const;
export type InvoiceSeries = (typeof INVOICE_SERIES)[number];

/** Platform-issued series are not per tenant, so they share one scope key. */
export const PLATFORM_SCOPE = 'system';

export type StoredInvoiceSequence = {
  series: InvoiceSeries;
  /** Tenant id for a tenant-issued series, or `PLATFORM_SCOPE`. */
  scope: string;
  /** The number appears in the invoice number, so each year counts separately. */
  year: number;
  nextValue: number;
};

export interface InvoiceNumberRepository {
  /**
   * Takes the next number in one series and returns it.
   *
   * Two callers at the same moment must never receive the same number, and the
   * sequence must not skip. The implementation therefore increments inside the
   * database rather than reading, adding, and writing back.
   */
  allocate(series: InvoiceSeries, scope: string, year: number): Promise<number>;
  peek(series: InvoiceSeries, scope: string, year: number): Promise<number>;
}

export const INVOICE_NUMBER_REPOSITORY = Symbol('INVOICE_NUMBER_REPOSITORY');
