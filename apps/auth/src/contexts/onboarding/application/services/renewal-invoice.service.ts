import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import { addDaysToDate, lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  type InvoiceRepository,
  type InvoiceWithLines,
  type StoredInvoiceLine,
} from '@auth/onboarding/domain/invoice.repository';
import {
  LICENCE_PERIOD_REPOSITORY,
  RENEWAL_FACTS_READER,
  type LicencePeriodRepository,
  type RenewalFacts,
  type RenewalFactsReader,
  type StoredLicencePeriod,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  billableDeviceCount,
  priceRenewal,
  renewalDueDate,
  renewalLineName,
  seedPeriodDates,
  type RenewalPricing,
} from '@auth/onboarding/domain/licence-renewal';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
  type StoredM2mLicensePlan,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  INVOICE_NUMBER_ALLOCATOR,
  type InvoiceNumberAllocator,
} from '@auth/onboarding/domain/ports/invoice-number.port';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { EnforcementNoticeService } from '../../../../enforcement-notice.service';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from '../../../../enforcement-settings.repository';
import { RenewalAudit } from '../../../../renewal-audit';
import { loadTaxRateBp } from '../use-cases/support/billing-terms';

export type RenewalRunSummary = {
  seeded: number;
  cancelled: number;
  repriced: number;
  issued: number;
  failed: number;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'unknown');

function renewalLine(invoice: InvoiceWithLines): StoredInvoiceLine | undefined {
  return invoice.lines.find((line) => line.kind === 'plan' && line.isRenewal);
}

@Injectable()
export class RenewalInvoiceService {
  private readonly logger = new Logger(RenewalInvoiceService.name);
  private readonly blockedReported = new Set<string>();

  constructor(
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(RENEWAL_FACTS_READER) private readonly facts: RenewalFactsReader,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly billingSettings: BillingSettingsRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
    @Inject(INVOICE_NUMBER_ALLOCATOR) private readonly numbers: InvoiceNumberAllocator,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(EnforcementNoticeService) private readonly notices: EnforcementNoticeService,
    @Inject(RenewalAudit) private readonly audit: RenewalAudit,
  ) {}

  async run(now: Date = new Date()): Promise<RenewalRunSummary> {
    const today = lagosDate(now);
    const summary: RenewalRunSummary = { seeded: 0, cancelled: 0, repriced: 0, issued: 0, failed: 0 };
    summary.seeded = await this.step('seed', 0, () => this.seedPeriods(today));
    summary.cancelled = await this.step('cancel', 0, () => this.cancelInvalid());
    summary.repriced = await this.step('reprice', 0, () => this.repriceOpen(today));
    await this.step('notices', undefined, () => this.resendNotices(today));
    const issued = await this.step('issue', { issued: 0, failed: 0 }, () => this.issueDue(today, now));
    return { ...summary, ...issued };
  }

  async seedPeriods(today: string): Promise<number> {
    let seeded = 0;
    for (const seed of await this.periods.purchaseSeeds()) {
      try {
        const dates = seedPeriodDates(seed, today);
        const inserted = await this.periods.insertSeeded({
          tenantId: seed.tenantId,
          applicationId: seed.applicationId,
          planCode: seed.planCode,
          deviceCount: seed.quantity,
          ...dates,
        });
        if (inserted) seeded += 1;
      } catch (error) {
        this.logger.error(`renewal_seed_failed:${seed.tenantId}:${errorText(error)}`);
      }
    }
    return seeded;
  }

  async cancelInvalid(): Promise<number> {
    let cancelled = 0;
    for (const invoice of await this.invoices.listOpenRenewals()) {
      try {
        if (await this.cancelIfInvalid(invoice)) cancelled += 1;
      } catch (error) {
        this.logger.error(`renewal_cancel_failed:${invoice.number}:${errorText(error)}`);
      }
    }
    return cancelled;
  }

  async repriceOpen(today: string): Promise<number> {
    let repriced = 0;
    for (const invoice of await this.invoices.listOpenRenewals()) {
      if (today >= invoice.dueDate) continue;
      try {
        if (await this.repriceIfChanged(invoice)) repriced += 1;
      } catch (error) {
        this.logger.error(`renewal_reprice_failed:${invoice.number}:${errorText(error)}`);
      }
    }
    return repriced;
  }

  async resendNotices(today: string): Promise<void> {
    const { graceDays } = await this.settings.get();
    for (const invoice of await this.invoices.listOpenRenewals()) {
      if (today > invoice.dueDate || !invoice.tenantId) continue;
      const period = await this.periods.findByRenewalInvoiceId(invoice.id);
      if (!period) continue;
      await this.notify(invoice, period.periodEnd, graceDays);
    }
  }

  async issueDue(today: string, now: Date): Promise<{ issued: number; failed: number }> {
    const settings = await this.settings.get();
    const due = await this.periods.listDue(addDaysToDate(today, settings.renewalLeadDays));
    let issued = 0;
    let failed = 0;
    for (const period of due) {
      try {
        if (await this.issueFor(period, now, settings.graceDays)) issued += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(`renewal_issue_failed:${period.tenantId}:${errorText(error)}`);
      }
    }
    return { issued, failed };
  }

  private async step<T>(name: string, fallback: T, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.logger.error(`renewal_${name}_failed:${errorText(error)}`);
      return fallback;
    }
  }

  private async hasLivePayment(invoiceId: string): Promise<boolean> {
    const payments = await this.payments.findByInvoiceId(invoiceId);
    return payments.some((payment) => payment.status === 'pending' || payment.status === 'paid');
  }

  private async cancelIfInvalid(invoice: InvoiceWithLines): Promise<boolean> {
    const period = await this.periods.findByRenewalInvoiceId(invoice.id);
    if (!period || period.status !== 'active') return false;
    const facts = await this.facts.facts(period.tenantId, period.applicationId);
    const reason = await this.invalidReason(period, facts);
    if (!reason) return false;
    if (await this.hasLivePayment(invoice.id)) {
      await this.reportBlocked(invoice, reason);
      return false;
    }
    if (!(await this.invoices.cancelRenewal(invoice.id))) return false;
    if (reason === 'terminated') await this.periods.end(period.id);
    else await this.periods.release(period.id, facts?.applicationPlanCode ?? period.planCode);
    await this.audit.cancelled({ invoiceId: invoice.id, number: invoice.number, reason });
    return true;
  }

  private async invalidReason(
    period: StoredLicencePeriod,
    facts: RenewalFacts | null,
  ): Promise<'terminated' | 'plan_changed' | null> {
    if (!facts || facts.terminated) return 'terminated';
    const planChanged = facts.applicationPlanCode !== null && facts.applicationPlanCode !== period.planCode;
    if (planChanged || !(await this.plans.findByCode(period.planCode))) return 'plan_changed';
    return null;
  }

  private async reportBlocked(invoice: InvoiceWithLines, reason: string): Promise<void> {
    if (this.blockedReported.has(invoice.id)) return;
    this.blockedReported.add(invoice.id);
    await this.audit.cancelBlocked({ invoiceId: invoice.id, number: invoice.number, reason });
  }

  private async repriceIfChanged(invoice: InvoiceWithLines): Promise<boolean> {
    const line = renewalLine(invoice);
    const period = await this.periods.findByRenewalInvoiceId(invoice.id);
    if (!line?.planCode || !period || (await this.hasLivePayment(invoice.id))) return false;
    const facts = await this.facts.facts(period.tenantId, period.applicationId);
    const plan = await this.plans.findByCode(line.planCode);
    if (!facts || !plan) return false;

    const taxRateBp = await loadTaxRateBp(this.billingSettings);
    const pricing = priceRenewal(plan, billableDeviceCount(period.deviceCount, facts.fleetDeviceCount), taxRateBp);
    if (!this.differs(invoice, line, pricing)) return false;
    const { totals } = pricing;
    const updated = await this.invoices.updateRenewalAmounts(invoice.id, {
      quantity: pricing.deviceCount,
      unitPriceKobo: pricing.unitPriceKobo,
      subtotalKobo: totals.subtotalKobo,
      taxRateBp,
      taxKobo: totals.taxKobo,
      totalKobo: totals.totalKobo,
    });
    if (!updated) return false;
    await this.audit.repriced({
      invoiceId: invoice.id,
      number: invoice.number,
      fromNgn: koboToNgn(invoice.totalKobo),
      toNgn: koboToNgn(totals.totalKobo),
      deviceCount: pricing.deviceCount,
    });
    return true;
  }

  private differs(invoice: InvoiceWithLines, line: StoredInvoiceLine, pricing: RenewalPricing): boolean {
    return (
      line.quantity !== pricing.deviceCount ||
      line.unitPriceKobo !== pricing.unitPriceKobo ||
      invoice.totalKobo !== pricing.totals.totalKobo ||
      invoice.taxKobo !== pricing.totals.taxKobo
    );
  }

  private async issueFor(period: StoredLicencePeriod, now: Date, graceDays: number): Promise<boolean> {
    if (period.tenantId === SYSTEM_TENANT_ID) return false;
    const facts = await this.facts.facts(period.tenantId, period.applicationId);
    if (!facts || facts.terminated || !facts.hasUser) return false;

    const planCode = facts.applicationPlanCode ?? period.planCode;
    const plan = await this.plans.findByCode(planCode);
    if (!plan) {
      this.logger.warn(`renewal_plan_missing:${period.tenantId}:${planCode}`);
      return false;
    }
    const email = facts.billingEmail ?? facts.adminEmail;
    if (!email) {
      this.logger.warn(`renewal_no_contact:${period.tenantId}`);
      return false;
    }
    const deviceCount = billableDeviceCount(period.deviceCount, facts.fleetDeviceCount);
    if (deviceCount <= 0) return false;

    const taxRateBp = await loadTaxRateBp(this.billingSettings);
    const pricing = priceRenewal(plan, deviceCount, taxRateBp);
    if (pricing.totals.totalKobo <= 0) {
      this.logger.warn(`renewal_zero_total:${period.tenantId}`);
      return false;
    }
    if (planCode !== period.planCode) await this.periods.release(period.id, planCode);

    const invoice = await this.build({ period, facts, plan, email, pricing, taxRateBp, now });
    const result = await this.invoices.createRenewal(invoice, period.id);
    if (!result.created) return false;

    await this.audit.issued({
      invoiceId: invoice.id,
      number: invoice.number,
      tenantId: period.tenantId,
      periodId: period.id,
      periodEnd: period.periodEnd,
      deviceCount,
      totalNgn: koboToNgn(invoice.totalKobo),
    });
    await this.notify(invoice, period.periodEnd, graceDays);
    return true;
  }

  private async build(input: {
    period: StoredLicencePeriod;
    facts: RenewalFacts;
    plan: StoredM2mLicensePlan;
    email: string;
    pricing: RenewalPricing;
    taxRateBp: number;
    now: Date;
  }): Promise<InvoiceWithLines> {
    const { period, facts, plan, pricing, now } = input;
    const allocated = await this.numbers.next(now);
    const issueDate = lagosDate(now);
    const id = this.ids.generate();
    return {
      id,
      number: allocated.number,
      prefix: allocated.prefix,
      year: allocated.year,
      sequence: allocated.sequence,
      quotationId: null,
      applicationId: period.applicationId,
      tenantId: period.tenantId,
      customerName: facts.customerName,
      customerType: facts.customerType,
      billingEmail: input.email,
      status: 'issued',
      issueDate,
      dueDate: renewalDueDate(period.periodEnd, issueDate),
      subtotalKobo: pricing.totals.subtotalKobo,
      discountKobo: 0,
      taxRateBp: input.taxRateBp,
      taxKobo: pricing.totals.taxKobo,
      totalKobo: pricing.totals.totalKobo,
      amountPaidKobo: 0,
      emailedAt: null,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: this.ids.generate(),
          invoiceId: id,
          position: 0,
          kind: 'plan',
          planCode: plan.code,
          name: renewalLineName(plan.name),
          description: null,
          quantity: pricing.deviceCount,
          unitPriceKobo: pricing.unitPriceKobo,
          validityDays: plan.validityDays,
          components: plan.components,
          isRenewal: true,
        },
      ],
    };
  }

  private async notify(invoice: InvoiceWithLines, periodEnd: string, graceDays: number): Promise<void> {
    if (!invoice.tenantId) return;
    try {
      const outcome = await this.notices.sendRenewalIssued({
        tenantId: invoice.tenantId,
        invoiceNumber: invoice.number,
        periodEnd,
        dueDate: invoice.dueDate,
        totalKobo: invoice.totalKobo,
        graceDays,
      });
      if (outcome === 'no_contact' || outcome === 'failed') {
        this.logger.warn(`renewal_notice_${outcome}:${invoice.number}`);
      }
    } catch (error) {
      this.logger.warn(`renewal_notice_error:${invoice.number}:${errorText(error)}`);
    }
  }
}
