import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError, BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import { PAYMENT_METHODS, type PaymentMethod } from '@auth/onboarding/domain/payment-method';
import {
  PAYMENT_HISTORY_REPOSITORY,
  type PaymentHistoryRepository,
} from '@auth/onboarding/domain/payment-history.repository';
import {
  storedTenantPaymentStatuses,
  TENANT_PAYMENT_STATUSES,
  type TenantPaymentStatus,
} from '@auth/onboarding/domain/payment-status';
import {
  QUOTATION_REPOSITORY,
  TENANT_QUOTATION_STATUSES,
  type QuotationRepository,
  type TenantQuotationStatus,
} from '@auth/onboarding/domain/quotation.repository';
import { success } from './billing-views';
import { tenantPaymentRowView, tenantQuotationDetailView, tenantQuotationRowView } from './tenant-document-views';
import { GetTenantInvoiceUseCase } from './tenant-billing.use-cases';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(field: string, allowed: readonly T[], value?: string): T | undefined {
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BillingValidationError(field, `${field} is not one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function day(field: string, value?: string): string | undefined {
  if (!value) return undefined;
  if (!ISO_DAY.test(value)) throw new BillingValidationError(field, `${field} must be YYYY-MM-DD`);
  return value;
}

export type ListTenantQuotationsInput = { q?: string; status?: string; page?: number; pageSize?: number };

@Injectable()
export class ListTenantQuotationsUseCase {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(tenantId: string, input: ListTenantQuotationsInput, now = new Date()) {
    const paging = clampPage(input.page, input.pageSize);
    const status: TenantQuotationStatus | undefined = oneOf('status', TENANT_QUOTATION_STATUSES, input.status);
    const { items, total } = await this.quotations.listForTenant({
      tenantId,
      q: input.q?.trim() || undefined,
      status,
      page: paging.page,
      limit: paging.limit,
      now,
    });
    return success({
      items: items.map((row) => tenantQuotationRowView(row, now)),
      total,
      page: paging.page,
      pageSize: paging.limit,
    });
  }
}

@Injectable()
export class GetTenantQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
  ) {}

  async execute(tenantId: string, id: string, now = new Date()) {
    const row = await this.quotations.findForTenant(tenantId, id, now);
    if (!row) throw new BillingNotFoundError('Quotation not found');
    const invoice = await this.invoices.findByQuotationId(row.quotation.id);
    return success(tenantQuotationDetailView(row, invoice?.number ?? null, now));
  }
}

export type ListTenantPaymentsInput = {
  q?: string;
  status?: string;
  method?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class ListTenantPaymentsUseCase {
  constructor(@Inject(PAYMENT_HISTORY_REPOSITORY) private readonly history: PaymentHistoryRepository) {}

  async execute(tenantId: string, input: ListTenantPaymentsInput) {
    const paging = clampPage(input.page, input.pageSize);
    const status: TenantPaymentStatus | undefined = oneOf('status', TENANT_PAYMENT_STATUSES, input.status);
    const method: PaymentMethod | undefined = oneOf('method', PAYMENT_METHODS, input.method);
    const { items, total } = await this.history.listForTenant({
      tenantId,
      q: input.q?.trim() || undefined,
      statuses: status ? storedTenantPaymentStatuses(status) : undefined,
      method,
      from: day('from', input.from),
      to: day('to', input.to),
      page: paging.page,
      limit: paging.limit,
    });
    return success({ items: items.map(tenantPaymentRowView), total, page: paging.page, pageSize: paging.limit });
  }
}

@Injectable()
export class GetTenantPaymentUseCase {
  constructor(
    @Inject(PAYMENT_HISTORY_REPOSITORY) private readonly history: PaymentHistoryRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(GetTenantInvoiceUseCase) private readonly getInvoice: GetTenantInvoiceUseCase,
    @Inject(GetTenantQuotationUseCase) private readonly getQuotation: GetTenantQuotationUseCase,
  ) {}

  async execute(tenantId: string, id: string, now = new Date()) {
    const row = await this.history.findForTenant(tenantId, id);
    if (!row) throw new BillingNotFoundError('Payment not found');
    const [relatedQuotation, relatedInvoice] = await Promise.all([
      this.quotation(tenantId, row.payment.quotationId, now),
      this.invoice(tenantId, row.payment.invoiceId, row.payment.quotationId, now),
    ]);
    return success({ ...tenantPaymentRowView(row), relatedInvoice, relatedQuotation });
  }

  private async quotation(tenantId: string, quotationId: string | null, now: Date) {
    if (!quotationId) return null;
    return this.orNotFound(() => this.getQuotation.execute(tenantId, quotationId, now));
  }

  private async invoice(tenantId: string, invoiceId: string | null, quotationId: string | null, now: Date) {
    const id = invoiceId ?? (quotationId ? (await this.invoices.findByQuotationId(quotationId))?.id : null);
    if (!id) return null;
    return this.orNotFound(() => this.getInvoice.execute(tenantId, id, now));
  }

  private async orNotFound<T>(load: () => Promise<{ data: T }>): Promise<T | null> {
    try {
      return (await load()).data;
    } catch (error) {
      if (error instanceof BillingNotFoundError) return null;
      throw error;
    }
  }
}
