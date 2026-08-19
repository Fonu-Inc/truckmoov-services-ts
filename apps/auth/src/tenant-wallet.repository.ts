export type StoredTenantWallet = {
  tenantId: string;
  balanceKobo: number;
  currency: string;
  updatedAt: Date;
};

export interface TenantWalletRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantWallet | null>;
  save(wallet: StoredTenantWallet): Promise<void>;
  /**
   * Atomically debit the wallet iff the current balance covers `amountKobo`.
   * Returns true on success, false if the wallet is missing or underfunded.
   * Prevents concurrent double-spend on the money path.
   */
  debit(tenantId: string, amountKobo: number): Promise<boolean>;
  /** Atomically credit the wallet (e.g. to refund a failed allocation). */
  credit(tenantId: string, amountKobo: number): Promise<void>;
}

export const TENANT_WALLET_REPOSITORY = Symbol('TENANT_WALLET_REPOSITORY');
