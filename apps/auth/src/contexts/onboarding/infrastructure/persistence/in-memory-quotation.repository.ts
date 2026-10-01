import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  effectiveQuotationStatus,
  type QuotationKey,
  type QuotationListFilter,
  type QuotationListRow,
  type QuotationRepository,
  type QuotationWithLines,
} from '@auth/onboarding/domain/quotation.repository';

function copy(quotation: QuotationWithLines): QuotationWithLines {
  return { ...quotation, lines: quotation.lines.map((line) => ({ ...line })) };
}

function sameKey(quotation: QuotationWithLines, key: QuotationKey): boolean {
  return (
    quotation.status !== 'cancelled' &&
    quotation.applicationId === key.applicationId &&
    quotation.planCode === key.planCode &&
    quotation.deviceCount === key.deviceCount &&
    quotation.totalKobo === key.totalKobo
  );
}

@Injectable()
export class InMemoryQuotationRepository implements QuotationRepository {
  private readonly quotations = new Map<string, QuotationWithLines>();

  constructor(
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
  ) {}

  async findActiveByKey(key: QuotationKey): Promise<QuotationWithLines | null> {
    return this.activeByKey(key);
  }

  private activeByKey(key: QuotationKey): QuotationWithLines | null {
    const found = [...this.quotations.values()].find((q) => sameKey(q, key));
    return found ? copy(found) : null;
  }

  async createIfAbsent(quotation: QuotationWithLines) {
    const existing = this.activeByKey({
      applicationId: quotation.applicationId ?? '',
      planCode: quotation.planCode,
      deviceCount: quotation.deviceCount,
      totalKobo: quotation.totalKobo,
    });
    if (existing) return { quotation: existing, created: false };
    this.quotations.set(quotation.id, copy(quotation));
    return { quotation: copy(quotation), created: true };
  }

  async extendValidity(id: string, validUntil: Date, now: Date): Promise<boolean> {
    const quotation = this.quotations.get(id);
    if (!quotation || quotation.status !== 'sent') return false;
    if (quotation.validUntil.getTime() >= now.getTime()) return false;
    quotation.validUntil = validUntil;
    quotation.updatedAt = now;
    return true;
  }

  async markAccepted(id: string, at: Date): Promise<boolean> {
    const quotation = this.quotations.get(id);
    if (!quotation) return false;
    if (quotation.status === 'accepted' || quotation.status === 'cancelled') return false;
    quotation.status = 'accepted';
    quotation.acceptedAt = at;
    quotation.updatedAt = at;
    return true;
  }

  async findById(id: string): Promise<QuotationWithLines | null> {
    const found = this.quotations.get(id);
    return found ? copy(found) : null;
  }

  async list(filter: QuotationListFilter) {
    const rows = await this.rowsWithPayments();
    const matching = rows
      .filter((row) => this.matches(row, filter))
      .sort(
        (a, b) =>
          b.quotation.createdAt.getTime() - a.quotation.createdAt.getTime() ||
          b.quotation.id.localeCompare(a.quotation.id),
      );
    const offset = (filter.page - 1) * filter.limit;
    return {
      items: matching.slice(offset, offset + filter.limit),
      total: matching.length,
    };
  }

  private async rowsWithPayments(): Promise<QuotationListRow[]> {
    return Promise.all(
      [...this.quotations.values()].map(async (quotation) => {
        const payments = await this.payments.findByQuotationId(quotation.id);
        const paidKobo = payments
          .filter((payment) => payment.status === 'paid')
          .reduce((sum, payment) => sum + payment.amountKobo, 0);
        const { lines, ...header } = copy(quotation);
        return { quotation: header, paidKobo, lineCount: lines.length };
      }),
    );
  }

  private matches(row: QuotationListRow, filter: QuotationListFilter): boolean {
    const { quotation, paidKobo } = row;
    const needle = filter.q?.trim().toLowerCase();
    if (
      needle &&
      !quotation.number.toLowerCase().includes(needle) &&
      !quotation.customerName.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (
      filter.status &&
      effectiveQuotationStatus(quotation, filter.now) !== filter.status
    ) {
      return false;
    }
    const complete = paidKobo >= quotation.totalKobo;
    if (filter.paymentStatus === 'complete') return complete;
    if (filter.paymentStatus === 'incomplete') return !complete;
    return true;
  }
}
