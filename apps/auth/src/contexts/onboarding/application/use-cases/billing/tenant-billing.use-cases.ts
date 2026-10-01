import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { daysBetween } from '@auth/onboarding/domain/enforcement-stage';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
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
import { success } from './billing-views';
import { tenantInvoiceDetailView, tenantInvoiceView } from './tenant-invoice-views';

export type TenantInvoiceScope = 'open' | 'paid' | 'all';

export type ListTenantInvoicesInput = { status?: TenantInvoiceScope; page?: number; pageSize?: number };

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
      scope: input.status ?? 'all',
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
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async execute(tenantId: string, invoiceId: string, now = new Date()) {
    const invoice = await this.invoices.findForTenant(tenantId, invoiceId);
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    const [ends, { graceDays }] = await Promise.all([
      this.periods.periodEndsForInvoices([invoice.id]),
      this.settings.get(),
    ]);
    return success(
      tenantInvoiceDetailView(invoice, {
        isRenewal: invoice.isRenewal,
        periodEnd: ends.get(invoice.id) ?? null,
        graceDays,
        today: lagosDate(now),
      }),
    );
  }
}

@Injectable()
export class GetTenantLicenceUseCase {
  constructor(
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
  ) {}

  async execute(tenantId: string, now = new Date()) {
    const period = await this.periods.findActiveByTenant(tenantId);
    if (!period) return success(null);
    const plan = await this.plans.findByCode(period.planCode);
    return success({
      planCode: period.planCode,
      planName: plan?.name ?? period.planCode,
      deviceCount: period.deviceCount,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      daysLeft: Math.max(0, daysBetween(lagosDate(now), period.periodEnd)),
      status: period.status,
      renewalInvoiceId: period.renewalInvoiceId,
    });
  }
}
