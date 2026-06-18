export type StoredTenantWallet = {
  tenantId: string;
  balanceKobo: number;
  currency: string;
  updatedAt: Date;
};

export interface TenantWalletRepository {
  findByTenantId(tenantId: string): Promise<StoredTenantWallet | null>;
  save(wallet: StoredTenantWallet): Promise<void>;
}

export const TENANT_WALLET_REPOSITORY = Symbol('TENANT_WALLET_REPOSITORY');
