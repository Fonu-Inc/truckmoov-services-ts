export type StoredWalletTopUp = {
  id: string;
  tenantId: string;
  amountKobo: number;
  provider: string;
  mobileNumber: string;
  status: string;
  reference: string | null;
  createdAt: Date;
};

export interface WalletTopUpRepository {
  findAllByTenantId(tenantId: string): Promise<StoredWalletTopUp[]>;
  sumSuccessfulByTenantId(tenantId: string): Promise<number>;
  countSuccessfulByTenantId(tenantId: string): Promise<number>;
  save(topUp: StoredWalletTopUp): Promise<void>;
}

export const WALLET_TOP_UP_REPOSITORY = Symbol('WALLET_TOP_UP_REPOSITORY');
