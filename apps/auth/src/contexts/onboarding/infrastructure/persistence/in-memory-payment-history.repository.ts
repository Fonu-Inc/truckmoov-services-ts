import { Inject, Injectable } from '@nestjs/common';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import type { StoredOnboardingPayment } from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from '@auth/onboarding/domain/quotation.repository';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import type {
  PaymentHistoryFilter,
  PaymentHistoryRepository,
  PaymentHistoryRow,
  TenantPaidAmount,
  TenantPaymentFilter,
  TenantPaymentRow,
} from '@auth/onboarding/domain/payment-history.repository';
import { isRenewalInvoice } from '@auth/onboarding/domain/invoice.repository';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import { InMemoryOnboardingPaymentRepository } from './in-memory-onboarding-payment.repository';

@Injectable()
export class InMemoryPaymentHistoryRepository implements PaymentHistoryRepository {
  constructor(
    @Inject(InMemoryOnboardingPaymentRepository)
    private readonly payments: InMemoryOnboardingPaymentRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
  ) {}

  async list(filter: PaymentHistoryFilter) {
    const rows = await Promise.all(this.payments.all().map((payment) => this.toRow(payment)));
    const needle = filter.q?.trim().toLowerCase();
    const matching = rows
      .filter(({ payment, customerName, quotationNumber }) => {
        if (filter.statuses && !filter.statuses.includes(payment.status)) return false;
        if (filter.method && payment.method !== filter.method) return false;
        if (!needle) return true;
        return [payment.reference, customerName, quotationNumber ?? '']
          .some((field) => field.toLowerCase().includes(needle));
      })
      .sort(
        (a, b) =>
          b.payment.createdAt.getTime() - a.payment.createdAt.getTime() ||
          b.payment.id.localeCompare(a.payment.id),
      );
    const offset = (filter.page - 1) * filter.limit;
    return { items: matching.slice(offset, offset + filter.limit), total: matching.length };
  }

  async findById(id: string): Promise<PaymentHistoryRow | null> {
    const payment = this.payments.all().find((candidate) => candidate.id === id);
    return payment ? this.toRow(payment) : null;
  }

  async listForTenant(filter: TenantPaymentFilter) {
    const rows = await this.tenantRows(filter.tenantId);
    const needle = filter.q?.trim().toLowerCase();
    const matching = rows
      .filter(({ payment }) => !filter.statuses || filter.statuses.includes(payment.status))
      .filter(({ payment }) => !filter.method || payment.method === filter.method)
      .filter(({ payment }) => inDateRange(payment.paidAt ?? payment.createdAt, filter))
      .filter(
        (row) =>
          !needle ||
          [row.payment.reference, row.invoiceNumber ?? '', row.quotationNumber ?? '', row.productName]
            .some((field) => field.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          (b.payment.paidAt ?? b.payment.createdAt).getTime() - (a.payment.paidAt ?? a.payment.createdAt).getTime() ||
          b.payment.id.localeCompare(a.payment.id),
      );
    const offset = (filter.page - 1) * filter.limit;
    return { items: matching.slice(offset, offset + filter.limit), total: matching.length };
  }

  async findForTenant(tenantId: string, id: string): Promise<TenantPaymentRow | null> {
    return (await this.tenantRows(tenantId)).find((row) => row.payment.id === id) ?? null;
  }

  async listPaidForTenant(tenantId: string): Promise<TenantPaidAmount[]> {
    return (await this.tenantRows(tenantId))
      .filter(({ payment }) => payment.status === 'paid' && payment.paidAt)
      .map(({ payment }) => ({
        id: payment.id,
        reference: payment.reference,
        paidAt: payment.paidAt as Date,
        amountKobo: payment.amountKobo,
      }))
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  }

  private async tenantRows(tenantId: string): Promise<TenantPaymentRow[]> {
    const rows = await Promise.all(this.payments.all().map((payment) => this.toTenantRow(payment)));
    return rows.filter((row) => row.ownerTenantId === tenantId).map(({ ownerTenantId: _owner, ...row }) => row);
  }

  private async toTenantRow(source: StoredOnboardingPayment) {
    const row = await this.toRow(source);
    const invoice = source.invoiceId ? await this.invoices.findById(source.invoiceId) : null;
    const quotation = source.quotationId ? await this.quotations.findById(source.quotationId) : null;
    const application = await this.applications.findById(source.applicationId);
    return {
      ...row,
      isRenewal: invoice ? isRenewalInvoice(invoice) : false,
      ownerTenantId: invoice?.tenantId ?? quotation?.tenantId ?? application?.tenantId ?? null,
    };
  }

  private async toRow(source: StoredOnboardingPayment): Promise<PaymentHistoryRow> {
    const payment = { ...source };
    const quotation = payment.quotationId
      ? await this.quotations.findById(payment.quotationId)
      : null;
    const invoice = payment.invoiceId ? await this.invoices.findById(payment.invoiceId) : null;
    const application = await this.applications.findById(payment.applicationId);
    const plan = await this.plans.findByCode(payment.planCode);
    return {
      payment,
      customerName:
        payment.customerName ?? quotation?.customerName ?? application?.organizationName ?? '',
      quotationNumber: quotation?.number ?? null,
      invoiceNumber: invoice?.number ?? null,
      productName: payment.orderSummary?.planName ?? plan?.name ?? payment.planCode,
    };
  }
}

function inDateRange(at: Date, filter: Pick<TenantPaymentFilter, 'from' | 'to'>): boolean {
  const day = lagosDate(at);
  return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
}
