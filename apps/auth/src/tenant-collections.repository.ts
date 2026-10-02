import type { PaymentMethod } from '@auth/onboarding/domain/payment-method';

export type TenantLastPayment = {
  amountKobo: number;
  paidAt: Date;
  method: PaymentMethod | null;
};

/**
 * Cash taken from tenants, attributed by invoice tenant, else application tenant.
 * Counts paid onboarding_payments not made from the wallet, and settled wallet
 * top-ups. Wallet-funded payments and bundle debits spend money already counted
 * as a top-up, so they are left out.
 */
export interface TenantCollectionsRepository {
  collectedKoboByTenant(from: Date, to: Date): Promise<Map<string, number>>;
  lastPaymentForTenant(tenantId: string): Promise<TenantLastPayment | null>;
}

export const TENANT_COLLECTIONS_REPOSITORY = Symbol('TENANT_COLLECTIONS_REPOSITORY');

const LAGOS_OFFSET = '+01:00';

/** Africa/Lagos has no daylight saving, so the month edges are fixed-offset. */
export function lagosMonthBounds(now: Date): { from: Date; to: Date } {
  const shifted = new Date(now.getTime() + 3_600_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const edge = (y: number, m: number) =>
    new Date(`${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01T00:00:00${LAGOS_OFFSET}`);
  return { from: edge(year, month), to: edge(year, month + 1) };
}
