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
  'top_up',
  'refund',
  'adjustment',
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

export interface WalletLedgerRepository {
  list(
    tenantId: string,
    filters?: WalletLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }>;
  /** Total moved in one direction, optionally within one category and period. */
  sum(tenantId: string, filters?: WalletLedgerFilters): Promise<number>;
}

export const WALLET_LEDGER_REPOSITORY = Symbol('WALLET_LEDGER_REPOSITORY');
