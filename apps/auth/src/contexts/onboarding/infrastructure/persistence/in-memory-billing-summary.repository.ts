import { Inject, Injectable } from '@nestjs/common';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from '@auth/onboarding/domain/quotation.repository';
import type {
  BillingSummaryRepository,
  BillingSummaryTotals,
} from '@auth/onboarding/domain/billing-summary.repository';
import { InMemoryOnboardingPaymentRepository } from './in-memory-onboarding-payment.repository';

const EVERYTHING = { page: 1, limit: Number.MAX_SAFE_INTEGER };
const OPEN_INVOICE_STATUSES = new Set(['issued', 'partially_paid', 'overdue']);

@Injectable()
export class InMemoryBillingSummaryRepository implements BillingSummaryRepository {
  constructor(
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(InMemoryOnboardingPaymentRepository)
    private readonly payments: InMemoryOnboardingPaymentRepository,
  ) {}

  async totals(): Promise<BillingSummaryTotals> {
    const quotations = await this.quotations.list({ ...EVERYTHING, now: new Date() });
    const invoices = await this.invoices.list({ ...EVERYTHING, today: '0000-00-00' });

    return {
      activePlans: (await this.plans.findActive()).length,
      quotationsCount: quotations.items.filter(
        ({ quotation }) => quotation.status !== 'draft' && quotation.status !== 'cancelled',
      ).length,
      outstandingKobo: invoices.items
        .filter(({ invoice }) => OPEN_INVOICE_STATUSES.has(invoice.status))
        .reduce((sum, { invoice }) => sum + Math.max(invoice.totalKobo - invoice.amountPaidKobo, 0), 0),
      collectedKobo: this.payments
        .all()
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + payment.amountKobo, 0),
    };
  }
}
