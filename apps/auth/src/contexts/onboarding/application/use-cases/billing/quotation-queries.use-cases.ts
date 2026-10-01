import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError, BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  QUOTATION_REPOSITORY,
  QUOTATION_STATUSES,
  type QuotationPaymentStatusFilter,
  type QuotationRepository,
  type QuotationStatus,
} from '@auth/onboarding/domain/quotation.repository';
import { success } from './billing-views';
import { toQuotationDetailView, toQuotationRowView } from './quotation-views';

export type ListQuotationsInput = {
  q?: string;
  status?: string;
  paymentStatus?: string;
  page?: number;
  limit?: number;
};

const PAYMENT_STATUSES: QuotationPaymentStatusFilter[] = ['complete', 'incomplete'];

function parseStatus(value?: string): QuotationStatus | undefined {
  if (!value) return undefined;
  if (!(QUOTATION_STATUSES as readonly string[]).includes(value)) {
    throw new BillingValidationError('status', 'status is not a quotation status');
  }
  return value as QuotationStatus;
}

function parsePaymentStatus(value?: string): QuotationPaymentStatusFilter | undefined {
  if (!value) return undefined;
  if (!(PAYMENT_STATUSES as string[]).includes(value)) {
    throw new BillingValidationError('paymentStatus', 'paymentStatus must be complete or incomplete');
  }
  return value as QuotationPaymentStatusFilter;
}

@Injectable()
export class ListQuotationsUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
  ) {}

  async execute(input: ListQuotationsInput, now = new Date()) {
    const paging = clampPage(input.page, input.limit);
    const { items, total } = await this.quotations.list({
      q: input.q?.trim() || undefined,
      status: parseStatus(input.status),
      paymentStatus: parsePaymentStatus(input.paymentStatus),
      now,
      ...paging,
    });
    return success({
      items: items.map((row) =>
        toQuotationRowView(row.quotation, row.paidKobo, row.lineCount, now),
      ),
      total,
      ...paging,
    });
  }
}

@Injectable()
export class GetQuotationUseCase {
  constructor(
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY)
    private readonly payments: OnboardingPaymentRepository,
  ) {}

  async execute(id: string, now = new Date()) {
    const quotation = await this.quotations.findById(id);
    if (!quotation) throw new BillingNotFoundError('Quotation not found');
    const payments = await this.payments.findByQuotationId(quotation.id);
    return success(toQuotationDetailView(quotation, payments, now));
  }
}
