import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { daysBetween } from '@auth/onboarding/domain/enforcement-stage';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  TENANT_INVOICE_STATES,
  type InvoiceRepository,
  type TenantInvoiceState,
} from '@auth/onboarding/domain/invoice.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from '../../../../../enforcement-settings.repository';
import {
  TENANT_FIELD_ACTIVITY_READER,
  type TenantFieldActivityReader,
} from '@auth/onboarding/domain/tenant-field-activity.reader';
import { success } from './billing-views';
import { tenantInvoiceDetailView, tenantInvoiceView } from './tenant-invoice-views';

export type TenantInvoiceScope = 'open' | 'paid' | 'all';

export type ListTenantInvoicesInput = {
  status?: TenantInvoiceScope | TenantInvoiceState;
  q?: string;
  page?: number;
  pageSize?: number;
};

function resolveStatus(status: ListTenantInvoicesInput['status']) {
  const state = TENANT_INVOICE_STATES.find((candidate) => candidate === status);
  if (state) return { scope: 'all' as const, state };
  return { scope: (status ?? 'all') as TenantInvoiceScope, state: undefined };
}

@Injectable()
export class ListTenantInvoicesUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async execute(tenantId: string, input: ListTenantInvoicesInput, now = new Date()) {
    const paging = clampPage(input.page, input.pageSize);
    const today = lagosDate(now);
    const { graceDays } = await this.settings.get();
    const page = await this.invoices.listForTenant({
      tenantId,
      ...resolveStatus(input.status),
      q: input.q?.trim() || undefined,
      today,
      page: paging.page,
      limit: paging.limit,
    });
    const ends = await this.periods.periodEndsForInvoices(page.items.map((row) => row.invoice.id));
    return success({
      items: page.items.map((row) =>
        tenantInvoiceView(row.invoice, {
          isRenewal: row.isRenewal,
          periodEnd: ends.get(row.invoice.id) ?? null,
          graceDays,
          today,
          plan: row.plan,
          quotationNumber: row.quotationNumber,
        }),
      ),
      openTotalNgn: koboToNgn(page.openTotalKobo),
      nextDueDate: page.nextDueDate,
      total: page.total,
      page: paging.page,
      pageSize: paging.limit,
    });
  }
}

@Injectable()
export class GetTenantInvoiceUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async execute(tenantId: string, invoiceId: string, now = new Date()) {
    const invoice = await this.invoices.findForTenant(tenantId, invoiceId);
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    const [ends, { graceDays }, quotationNumber, payments] = await Promise.all([
      this.periods.periodEndsForInvoices([invoice.id]),
      this.settings.get(),
      this.invoices.findQuotationNumber(invoice.id),
      this.successfulPayments(invoice.id, invoice.quotationId),
    ]);
    return success(
      tenantInvoiceDetailView(
        invoice,
        {
          isRenewal: invoice.isRenewal,
          periodEnd: ends.get(invoice.id) ?? null,
          graceDays,
          today: lagosDate(now),
          quotationNumber,
        },
        payments,
      ),
    );
  }

  private async successfulPayments(invoiceId: string, quotationId: string | null) {
    const [linked, quoted] = await Promise.all([
      this.payments.findByInvoiceId(invoiceId),
      quotationId ? this.payments.findByQuotationId(quotationId) : [],
    ]);
    const unique = new Map([...linked, ...quoted].map((payment) => [payment.id, payment]));
    return [...unique.values()]
      .filter((payment) => payment.status === 'paid')
      .sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));
  }
}

@Injectable()
export class GetTenantLicenceUseCase {
  constructor(
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(TENANT_FIELD_ACTIVITY_READER) private readonly usage: TenantFieldActivityReader,
  ) {}

  async execute(tenantId: string, now = new Date()) {
    const period = await this.periods.findActiveByTenant(tenantId);
    if (!period) return success(null);
    const [plan, invoice, usage] = await Promise.all([
      this.plans.findByCode(period.planCode),
      this.invoices.findLatestPaidPlanInvoice(tenantId),
      this.usage.usageCounts(tenantId),
    ]);
    const line = invoice?.lines.find((candidate) => candidate.kind === 'plan');
    return success({
      planCode: period.planCode,
      planName: plan?.name ?? period.planCode,
      deviceCount: period.deviceCount,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      daysLeft: Math.max(0, daysBetween(lagosDate(now), period.periodEnd)),
      status: period.status,
      renewalInvoiceId: period.renewalInvoiceId,
      pricePerDeviceNgn: line ? koboToNgn(line.unitPriceKobo) : null,
      renewalPricePerDeviceNgn: plan?.perDeviceRenewalNgn ?? null,
      totalPaidNgn: invoice ? koboToNgn(invoice.amountPaidKobo) : null,
      validityDays: line?.validityDays ?? plan?.validityDays ?? null,
      invoiceNumber: invoice?.number ?? null,
      devicesInUse: usage?.devices ?? null,
      vehiclesInUse: usage?.vehicles ?? null,
      simsInUse: usage?.sims ?? null,
    });
  }
}
