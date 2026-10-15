import type { WalletCreditSettings, WalletStatus } from './wallet-credit';
import type { StoredWalletLedgerEntry, WalletLedgerDraft } from './wallet-ledger.repository';

export type StoredTenantWallet = WalletCreditSettings & {
  tenantId: string;
  balanceKobo: number;
  currency: string;
  updatedAt: Date;
};

/** One row of the platform-wide wallet list. */
export type TenantWalletSummaryRow = StoredTenantWallet & {
  status: WalletStatus;
};

export type TenantWalletTotals = {
  totalWallets: number;
  totalBalanceKobo: number;
  lowBalance: number;
  negativeBalance: number;
};

export type WalletMovementResult = {
  ok: boolean;
  /** Balance once the movement applied, or null when nothing moved. */
  balanceAfterKobo: number | null;
  /** True when the idempotency key was already applied; the original entry is returned and nothing moved. */
  replayed: boolean;
  /** The ledger entry written, or the original one on replay. Null when nothing moved. */
  entry: StoredWalletLedgerEntry | null;
};

export interface TenantWalletRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantWallet | null>;
  save(wallet: StoredTenantWallet): Promise<void>;
  /** Writes only the credit settings, so a concurrent debit or credit to the balance is never overwritten. */
  updateCreditSettings(tenantId: string, settings: WalletCreditSettings): Promise<StoredTenantWallet>;
  /**
   * Atomically debit the wallet iff the current balance covers `amountKobo`,
   * and write the matching ledger entry under the same lock.
   *
   * The ledger row carries the balance after the movement, so it can only be
   * written where the balance is held still. Two concurrent debits therefore
   * cannot record the same starting balance.
   */
  debit(tenantId: string, amountKobo: number, entry: WalletLedgerDraft): Promise<WalletMovementResult>;
  /** Atomically credit the wallet, writing its ledger entry in the same step. */
  credit(tenantId: string, amountKobo: number, entry: WalletLedgerDraft): Promise<WalletMovementResult>;
  /** Every tenant's wallet, for the platform view. */
  findAll(): Promise<StoredTenantWallet[]>;
  /**
   * Returns the tenant's wallet, creating an empty one if it has none.
   *
   * A tenant that has never paid has no wallet row, and both credit and debit
   * refuse when the row is missing. Platform staff must still be able to credit
   * such a tenant — a bank transfer that landed before they ever used the app
   * is exactly the case the platform top-up exists for.
   */
  ensure(tenantId: string): Promise<StoredTenantWallet>;
}

export const TENANT_WALLET_REPOSITORY = Symbol('TENANT_WALLET_REPOSITORY');
