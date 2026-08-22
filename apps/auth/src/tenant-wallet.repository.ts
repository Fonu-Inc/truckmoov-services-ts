import type { WalletLedgerDraft } from './wallet-ledger.repository';

export type StoredTenantWallet = {
  tenantId: string;
  balanceKobo: number;
  currency: string;
  updatedAt: Date;
};

export type WalletMovementResult = {
  ok: boolean;
  /** Balance once the movement applied, or null when nothing moved. */
  balanceAfterKobo: number | null;
};

export interface TenantWalletRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantWallet | null>;
  save(wallet: StoredTenantWallet): Promise<void>;
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
}

export const TENANT_WALLET_REPOSITORY = Symbol('TENANT_WALLET_REPOSITORY');
