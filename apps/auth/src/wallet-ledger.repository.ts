/**
 * What the money was spent on. One wallet funds every category, so the category
 * is what lets a screen show communications spend apart from data-bundle spend
 * without the tenant having to fund two balances.
 */
export const WALLET_LEDGER_CATEGORIES = [
  'data_bundle',
  'sms',
  'whatsapp',
  'voice',
  'ai',
  'sim_provisioning',
  'subscription',
  'top_up',
  'refund',
  'adjustment',
  'goodwill',
] as const;
export type WalletLedgerCategory = (typeof WALLET_LEDGER_CATEGORIES)[number];

export type WalletLedgerDirection = 'debit' | 'credit';

/**
 * What a caller supplies when money moves. The balance after the movement is
 * not supplied: only the repository knows it, because only the repository holds
 * the lock that makes the number correct.
 */
export type WalletLedgerDraft = {
  category: WalletLedgerCategory;
  /** How many units the charge covers, for example 5 SIMs or 200 messages. */
  quantity: number;
  /**
   * The rate applied at this moment, stored rather than referenced. A later rate
   * change must not re-price a line that already happened.
   */
  unitRateKobo: number;
  /** Shown to the tenant, so it reads as a sentence rather than a code. */
  reason: string;
  reference?: string | null;
  /** Unique per tenant. A repeat call with the same key returns the original entry and moves no money. */
  idempotencyKey?: string | null;
};

export type StoredWalletLedgerEntry = WalletLedgerDraft & {
  id: string;
  /** Total order for the statement. Two entries can share a timestamp. */
  seq: number;
  tenantId: string;
  direction: WalletLedgerDirection;
  amountKobo: number;
  /** The balance once this entry was applied. Written under the same lock as the balance itself. */
  balanceAfterKobo: number;
  createdAt: Date;
};

export type WalletLedgerFilters = {
  category?: WalletLedgerCategory;
  direction?: WalletLedgerDirection;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

export type CrossTenantLedgerFilters = WalletLedgerFilters & {
  tenantId?: string;
  /** Matches tenant, description or reference. */
  query?: string;
};

export interface WalletLedgerRepository {
  /**
   * Every tenant's ledger in one list, for the platform view.
   *
   * The balance on each line is that tenant's running balance, so rows are
   * ordered per tenant rather than by a single platform sequence — a mixed
   * ordering would make the balances read as nonsense.
   */
  listAcrossTenants(
    filters?: CrossTenantLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }>;
  list(
    tenantId: string,
    filters?: WalletLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }>;
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<StoredWalletLedgerEntry | null>;
  /** Total moved in one direction, optionally within one category and period. */
  sum(tenantId: string, filters?: WalletLedgerFilters): Promise<number>;
}

export const WALLET_LEDGER_REPOSITORY = Symbol('WALLET_LEDGER_REPOSITORY');

const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

/** An empty key means no key, and a key the column cannot hold is refused before any money moves. */
export function withNormalizedKey(entry: WalletLedgerDraft): WalletLedgerDraft {
  const key = entry.idempotencyKey?.trim() || null;
  if (key && key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(`Idempotency key is longer than ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
  }
  return { ...entry, idempotencyKey: key };
}
