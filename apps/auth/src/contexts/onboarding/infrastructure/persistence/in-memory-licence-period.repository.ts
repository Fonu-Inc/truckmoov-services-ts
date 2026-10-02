import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DUPLICATE_PAYMENT_NOTE,
  type LicencePeriodRepository,
  type NewLicencePeriod,
  type PurchaseSeed,
  type RenewalFacts,
  type RenewalFactsReader,
  type RenewalSettlement,
  type RenewalSettlementInput,
  type StoredLicencePeriod,
} from '@auth/onboarding/domain/licence-period.repository';
import { nextPeriodDates } from '@auth/onboarding/domain/licence-renewal';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { InMemoryInvoiceRepository } from './in-memory-invoice.repository';

@Injectable()
export class InMemoryLicencePeriodRepository implements LicencePeriodRepository {
  private readonly periods = new Map<string, StoredLicencePeriod>();
  readonly seeds: PurchaseSeed[] = [];
  private settling: Promise<void> = Promise.resolve();

  constructor(
    @Inject(InMemoryInvoiceRepository) private readonly invoices: InMemoryInvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
  ) {}

  all(): StoredLicencePeriod[] {
    return [...this.periods.values()].map((period) => this.view(period));
  }

  private view(period: StoredLicencePeriod): StoredLicencePeriod {
    return { ...period, renewalInvoiceId: this.invoices.linkedInvoiceId(period.id) };
  }

  async currentPlanCodes(): Promise<Map<string, string>> {
    const ranked = [...this.periods.values()].sort(
      (a, b) =>
        Number(b.status === 'active') - Number(a.status === 'active') || b.periodEnd.localeCompare(a.periodEnd),
    );
    const codes = new Map<string, string>();
    for (const period of ranked) {
      if (!codes.has(period.tenantId)) codes.set(period.tenantId, period.planCode);
    }
    return codes;
  }

  async purchaseSeeds(): Promise<PurchaseSeed[]> {
    const known = new Set([...this.periods.values()].map((period) => period.tenantId));
    return this.seeds.filter((seed) => !known.has(seed.tenantId));
  }

  async insertSeeded(period: NewLicencePeriod): Promise<boolean> {
    const clash = [...this.periods.values()].some(
      (existing) =>
        existing.tenantId === period.tenantId &&
        (existing.periodEnd === period.periodEnd || existing.status === 'active'),
    );
    if (clash) return false;
    this.add({ ...period, status: 'active', origin: period.origin });
    return true;
  }

  add(period: NewLicencePeriod & { status?: StoredLicencePeriod['status'] }): StoredLicencePeriod {
    const now = new Date();
    const stored: StoredLicencePeriod = {
      status: 'active',
      ...period,
      id: randomUUID(),
      renewalInvoiceId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.periods.set(stored.id, stored);
    return this.view(stored);
  }

  async listDue(cutoff: string): Promise<StoredLicencePeriod[]> {
    return this.all()
      .filter(
        (period) => period.status === 'active' && period.renewalInvoiceId === null && period.periodEnd <= cutoff,
      )
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.tenantId.localeCompare(b.tenantId));
  }

  async listByTenant(tenantId: string): Promise<StoredLicencePeriod[]> {
    return this.all()
      .filter((period) => period.tenantId === tenantId)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findActiveByTenant(tenantId: string): Promise<StoredLicencePeriod | null> {
    return this.all().find((period) => period.tenantId === tenantId && period.status === 'active') ?? null;
  }

  async findByRenewalInvoiceId(invoiceId: string): Promise<StoredLicencePeriod | null> {
    return this.all().find((period) => period.renewalInvoiceId === invoiceId) ?? null;
  }

  async periodEndsForInvoices(invoiceIds: string[]): Promise<Map<string, string>> {
    const wanted = new Set(invoiceIds);
    const ends = new Map<string, string>();
    for (const period of this.all()) {
      if (period.renewalInvoiceId && wanted.has(period.renewalInvoiceId)) {
        ends.set(period.renewalInvoiceId, period.periodEnd);
      }
    }
    return ends;
  }

  async release(periodId: string, planCode: string): Promise<void> {
    const period = this.periods.get(periodId);
    if (!period || period.status !== 'active') return;
    this.invoices.unlink(periodId);
    Object.assign(period, { planCode, updatedAt: new Date() });
  }

  async end(periodId: string): Promise<void> {
    const period = this.periods.get(periodId);
    if (period?.status === 'active') Object.assign(period, { status: 'ended', updatedAt: new Date() });
  }

  async settleRenewalPayment(input: RenewalSettlementInput): Promise<RenewalSettlement> {
    const run = this.settling.then(() => this.settle(input));
    this.settling = run.then(() => undefined, () => undefined);
    return run;
  }

  private async settle(input: RenewalSettlementInput): Promise<RenewalSettlement> {
    const invoice = await this.invoices.findById(input.invoiceId);
    const payments = await this.payments.findByInvoiceId(input.invoiceId);
    const payment = payments.find((candidate) => candidate.id === input.paymentId);
    if (!invoice || payment?.status !== 'paid') return { outcome: 'not_applicable' };

    const others = payments
      .filter((candidate) => candidate.id !== payment.id && candidate.status === 'paid')
      .reduce((sum, candidate) => sum + candidate.amountKobo, 0);
    const closed = invoice.status === 'cancelled' || invoice.status === 'draft';
    if (closed || others >= invoice.totalKobo) {
      await this.payments.save({ ...payment, status: 'refunded', note: DUPLICATE_PAYMENT_NOTE });
      return { outcome: 'duplicate', amountKobo: payment.amountKobo, reason: closed ? 'invoice_closed' : 'duplicate' };
    }

    await this.invoices.recomputePaid(input.invoiceId);
    if (others + payment.amountKobo < invoice.totalKobo) return { outcome: 'partial' };
    return this.extend(invoice.lines, input);
  }

  private async extend(
    lines: Array<{ kind: string; isRenewal: boolean; planCode: string | null; quantity: number; validityDays: number | null }>,
    input: RenewalSettlementInput,
  ): Promise<RenewalSettlement> {
    const current = await this.findByRenewalInvoiceId(input.invoiceId);
    if (!current) return { outcome: 'no_change', newPeriodEnd: null };
    if (current.status !== 'active') {
      return { outcome: 'no_change', newPeriodEnd: (await this.findActiveByTenant(current.tenantId))?.periodEnd ?? null };
    }
    const line = lines.find((candidate) => candidate.kind === 'plan' && candidate.isRenewal);
    if (!line || line.validityDays === null) return { outcome: 'no_change', newPeriodEnd: null };

    const next = nextPeriodDates(current.periodEnd, line.validityDays, input.today);
    const stored = this.periods.get(current.id);
    if (stored) Object.assign(stored, { status: 'renewed', updatedAt: new Date() });
    this.add({
      tenantId: current.tenantId,
      applicationId: current.applicationId,
      planCode: line.planCode ?? current.planCode,
      deviceCount: line.quantity,
      origin: 'renewal',
      ...next,
    });
    return { outcome: 'renewed', newPeriodEnd: next.periodEnd };
  }
}

@Injectable()
export class InMemoryRenewalFactsReader implements RenewalFactsReader {
  readonly byTenant = new Map<string, RenewalFacts>();

  async facts(tenantId: string, _applicationId?: string): Promise<RenewalFacts | null> {
    return this.byTenant.get(tenantId) ?? null;
  }
}
