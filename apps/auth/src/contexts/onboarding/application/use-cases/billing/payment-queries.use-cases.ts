import { Inject, Injectable } from '@nestjs/common';
import { BillingNotFoundError, BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import {
  PAYMENT_HISTORY_REPOSITORY,
  type PaymentHistoryRepository,
} from '@auth/onboarding/domain/payment-history.repository';
import { PAYMENT_METHODS, type PaymentMethod } from '@auth/onboarding/domain/payment-method';
import {
  PAYMENT_API_STATUSES,
  storedPaymentStatuses,
  type PaymentApiStatus,
} from '@auth/onboarding/domain/payment-status';
import { success } from './billing-views';
import { toPaymentDetailView, toPaymentRowView } from './payment-views';

export type ListPaymentsInput = {
  q?: string;
  status?: string;
  method?: string;
  page?: number;
  limit?: number;
};

function parseStatus(value?: string): PaymentApiStatus | undefined {
  if (!value) return undefined;
  if (!(PAYMENT_API_STATUSES as readonly string[]).includes(value)) {
    throw new BillingValidationError('status', 'status is not a payment status');
  }
  return value as PaymentApiStatus;
}

function parseMethod(value?: string): PaymentMethod | undefined {
  if (!value) return undefined;
  if (!(PAYMENT_METHODS as readonly string[]).includes(value)) {
    throw new BillingValidationError('method', 'method is not a payment method');
  }
  return value as PaymentMethod;
}

@Injectable()
export class ListPaymentsUseCase {
  constructor(
    @Inject(PAYMENT_HISTORY_REPOSITORY) private readonly history: PaymentHistoryRepository,
  ) {}

  async execute(input: ListPaymentsInput) {
    const paging = clampPage(input.page, input.limit);
    const status = parseStatus(input.status);
    const { items, total } = await this.history.list({
      q: input.q?.trim() || undefined,
      statuses: status ? storedPaymentStatuses(status) : undefined,
      method: parseMethod(input.method),
      ...paging,
    });
    return success({ items: items.map(toPaymentRowView), total, ...paging });
  }
}

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_HISTORY_REPOSITORY) private readonly history: PaymentHistoryRepository,
  ) {}

  async execute(id: string) {
    const row = await this.history.findById(id);
    if (!row) throw new BillingNotFoundError('Payment not found');
    return success(toPaymentDetailView(row));
  }
}
