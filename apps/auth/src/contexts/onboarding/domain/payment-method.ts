export const PAYMENT_METHODS = ['card', 'bank_transfer', 'mtn_momo', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const CHANNEL_METHODS: Record<string, PaymentMethod> = {
  card: 'card',
  bank: 'bank_transfer',
  bank_transfer: 'bank_transfer',
  mobile_money: 'mtn_momo',
  ussd: 'other',
  other: 'other',
};

/** Null when the provider did not say; any channel we do not list is other. */
export function methodFromChannel(channel?: string | null): PaymentMethod | null {
  const key = channel?.trim().toLowerCase();
  if (!key) return null;
  return CHANNEL_METHODS[key] ?? 'other';
}
