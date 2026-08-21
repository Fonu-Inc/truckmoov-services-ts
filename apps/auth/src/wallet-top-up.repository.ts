export type StoredWalletTopUp = {
  id: string;
  tenantId: string;
  amountKobo: number;
  provider: string;
  mobileNumber: string;
  status: string;
  reference: string | null;
  settledAt: Date | null;
  createdAt: Date;
};

export interface WalletTopUpRepository {
  findAllByTenantId(tenantId: string): Promise<StoredWalletTopUp[]>;
  findByReference(reference: string): Promise<StoredWalletTopUp | null>;
  sumSuccessfulByTenantId(tenantId: string): Promise<number>;
  countSuccessfulByTenantId(tenantId: string): Promise<number>;
  save(topUp: StoredWalletTopUp): Promise<void>;
  /**
   * Atomically move a top-up from `pending` to `success`, stamping settled_at.
   * Returns true only for the caller that won the transition, so a replayed
   * provider callback cannot credit the wallet twice.
   */
  markSettled(id: string, settledAt: Date): Promise<boolean>;
}

export const WALLET_TOP_UP_REPOSITORY = Symbol('WALLET_TOP_UP_REPOSITORY');
