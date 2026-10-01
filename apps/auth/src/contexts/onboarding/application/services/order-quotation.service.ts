import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import {
  M2M_LICENSE_PLAN_REPOSITORY,
  type M2mLicensePlanRepository,
} from '@auth/onboarding/domain/m2m-license-plan.repository';
import type { StoredOnboardingApplication } from '@auth/onboarding/domain/onboarding-application.repository';
import { toKobo, type OnboardingOrderSummary } from '@auth/onboarding/domain/onboarding-order';
import {
  QUOTATION_REPOSITORY,
  quotationExpired,
  type QuotationKey,
  type QuotationRepository,
  type QuotationWithLines,
  type StoredQuotationLine,
} from '@auth/onboarding/domain/quotation.repository';
import { computeTotals } from '@auth/onboarding/domain/quotation-totals';
import {
  QUOTATION_NUMBER_ALLOCATOR,
  type QuotationNumberAllocator,
} from '@auth/onboarding/domain/ports/quotation-number.port';
import { loadQuoteValidityDays } from '../use-cases/support/billing-terms';

const DAY_MS = 24 * 60 * 60 * 1000;

export class QuotationTotalMismatchError extends Error {
  constructor() {
    super('The quotation total does not match the priced order');
    this.name = 'QuotationTotalMismatchError';
  }
}

@Injectable()
export class OrderQuotationService {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(QUOTATION_NUMBER_ALLOCATOR) private readonly numbers: QuotationNumberAllocator,
    @Inject(M2M_LICENSE_PLAN_REPOSITORY) private readonly plans: M2mLicensePlanRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly settings: BillingSettingsRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async ensure(
    application: StoredOnboardingApplication,
    summary: OnboardingOrderSummary,
    now = new Date(),
  ): Promise<QuotationWithLines> {
    const key: QuotationKey = {
      applicationId: application.id,
      planCode: summary.planCode,
      deviceCount: summary.deviceCount,
      totalKobo: toKobo(summary.totalNgn),
    };
    const validityDays = await loadQuoteValidityDays(this.settings);

    const existing = await this.quotations.findActiveByKey(key);
    if (existing) return this.reuse(existing, validityDays, now);

    const draft = await this.build(application, summary, key, validityDays, now);
    const { quotation } = await this.quotations.createIfAbsent(draft);
    return quotation;
  }

  private async reuse(
    existing: QuotationWithLines,
    validityDays: number,
    now: Date,
  ): Promise<QuotationWithLines> {
    if (!quotationExpired(existing, now)) return existing;
    await this.quotations.extendValidity(
      existing.id,
      new Date(now.getTime() + validityDays * DAY_MS),
      now,
    );
    return (await this.quotations.findById(existing.id)) ?? existing;
  }

  private async build(
    application: StoredOnboardingApplication,
    summary: OnboardingOrderSummary,
    key: QuotationKey,
    validityDays: number,
    now: Date,
  ): Promise<QuotationWithLines> {
    const id = this.idGenerator.generate();
    const lines = await this.buildLines(id, summary);
    const totals = computeTotals(lines, 0, summary.taxRateBp);
    if (totals.totalKobo !== key.totalKobo) throw new QuotationTotalMismatchError();

    const allocated = await this.numbers.next(now);
    return {
      id,
      number: allocated.number,
      prefix: allocated.prefix,
      year: allocated.year,
      sequence: allocated.sequence,
      applicationId: application.id,
      tenantId: null,
      planCode: summary.planCode,
      deviceCount: summary.deviceCount,
      customerName: application.organizationName,
      customerType: application.applicantType,
      billingEmail: application.billingEmail ?? '',
      status: 'sent',
      subtotalKobo: totals.subtotalKobo,
      discountKobo: totals.discountKobo,
      taxRateBp: summary.taxRateBp,
      taxKobo: totals.taxKobo,
      totalKobo: totals.totalKobo,
      validUntil: new Date(now.getTime() + validityDays * DAY_MS),
      sentAt: now,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
      lines,
    };
  }

  private async buildLines(
    quotationId: string,
    summary: OnboardingOrderSummary,
  ): Promise<StoredQuotationLine[]> {
    const plan = await this.plans.findByCode(summary.planCode);
    return [
      {
        id: this.idGenerator.generate(),
        quotationId,
        position: 0,
        kind: 'plan',
        planCode: summary.planCode,
        name: summary.planName,
        description: plan?.description ?? null,
        quantity: summary.deviceCount,
        unitPriceKobo: toKobo(summary.perDeviceNgn),
        validityDays: plan?.validityDays ?? null,
        components: plan?.components ?? null,
        isRenewal: false,
      },
      {
        id: this.idGenerator.generate(),
        quotationId,
        position: 1,
        kind: 'installation',
        planCode: null,
        name: 'Installation',
        description: 'Device installation, per device',
        quantity: summary.deviceCount,
        unitPriceKobo: toKobo(summary.installationPerDeviceNgn),
        validityDays: null,
        components: null,
        isRenewal: false,
      },
    ];
  }
}
