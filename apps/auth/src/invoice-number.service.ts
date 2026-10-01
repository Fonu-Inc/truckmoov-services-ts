import { Inject, Injectable } from '@nestjs/common';
import {
  INVOICE_NUMBER_REPOSITORY,
  PLATFORM_SCOPE,
  type InvoiceNumberRepository,
  type InvoiceSeries,
} from './invoice-number.repository';

export const DEFAULT_TENANT_INVOICE_PREFIX = 'INV';

/** Digit width and default prefix per series, taken from the examples in the requirements. */
const SERIES_FORMAT: Record<InvoiceSeries, { prefix: string; width: number }> = {
  platform_subscription: { prefix: 'INV', width: 3 },
  platform_usage: { prefix: 'POST', width: 3 },
  tenant_customer: { prefix: DEFAULT_TENANT_INVOICE_PREFIX, width: 4 },
  quotation: { prefix: 'QT', width: 4 },
};

export type AllocatedInvoiceNumber = {
  /** The complete number, for example INV-2026-0001. */
  invoiceNumber: string;
  series: InvoiceSeries;
  /** The prefix used, stored with the invoice so a later prefix change cannot renumber it. */
  prefix: string;
  year: number;
  sequence: number;
};

@Injectable()
export class InvoiceNumberService {
  constructor(
    @Inject(INVOICE_NUMBER_REPOSITORY)
    private readonly repository: InvoiceNumberRepository,
  ) {}

  /**
   * Takes the next number in a platform-issued series. These are not per tenant,
   * so every tenant's subscription invoices share one sequence.
   */
  async allocatePlatform(
    series: Extract<InvoiceSeries, 'platform_subscription' | 'platform_usage' | 'quotation'>,
    issuedAt = new Date(),
  ): Promise<AllocatedInvoiceNumber> {
    return this.allocate(series, PLATFORM_SCOPE, issuedAt);
  }

  /**
   * Takes the next number for an invoice a tenant issues to its own customer.
   * Numbers are unique per tenant, not across the platform, so two tenants can
   * both hold INV-2026-0001.
   */
  async allocateForTenant(
    tenantId: string,
    issuedAt = new Date(),
    prefix?: string | null,
  ): Promise<AllocatedInvoiceNumber> {
    return this.allocate('tenant_customer', tenantId, issuedAt, prefix);
  }

  private async allocate(
    series: InvoiceSeries,
    scope: string,
    issuedAt: Date,
    prefixOverride?: string | null,
  ): Promise<AllocatedInvoiceNumber> {
    const format = SERIES_FORMAT[series];
    const year = issuedAt.getUTCFullYear();
    const sequence = await this.repository.allocate(series, scope, year);

    const prefix = normalizePrefix(prefixOverride) ?? format.prefix;
    return {
      invoiceNumber: `${prefix}-${year}-${String(sequence).padStart(format.width, '0')}`,
      series,
      prefix,
      year,
      sequence,
    };
  }
}

function normalizePrefix(prefix?: string | null): string | null {
  const trimmed = prefix?.trim().toUpperCase();
  if (!trimmed) return null;
  // A prefix reaches the invoice number directly, so anything that would make
  // the number ambiguous to parse is rejected rather than silently cleaned.
  return /^[A-Z0-9]{1,12}$/.test(trimmed) ? trimmed : null;
}
