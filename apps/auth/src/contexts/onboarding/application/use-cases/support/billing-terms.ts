import {
  BILLING_SETTING_KEYS,
  type BillingSettingsRepository,
} from '@auth/onboarding/domain/billing-settings.repository';
import { percentToBasisPoints } from '@auth/onboarding/domain/quotation-totals';

const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

export async function loadTaxRateBp(
  settings: BillingSettingsRepository,
): Promise<number> {
  const stored = await settings.getAll();
  return percentToBasisPoints(
    stored[BILLING_SETTING_KEYS.defaultTaxRatePct]?.value ?? 0,
  );
}

export async function loadQuoteValidityDays(
  settings: BillingSettingsRepository,
): Promise<number> {
  const stored = await settings.getAll();
  const days = stored[BILLING_SETTING_KEYS.quoteValidityDays]?.value;
  return typeof days === 'number' && Number.isInteger(days) && days > 0
    ? days
    : DEFAULT_QUOTE_VALIDITY_DAYS;
}

const DEFAULT_INVOICE_DUE_DAYS = 15;

export async function loadInvoiceDueDays(
  settings: BillingSettingsRepository,
): Promise<number> {
  const stored = await settings.getAll();
  const days = stored[BILLING_SETTING_KEYS.invoiceDueDays]?.value;
  return typeof days === 'number' && Number.isInteger(days) && days >= 0
    ? days
    : DEFAULT_INVOICE_DUE_DAYS;
}
