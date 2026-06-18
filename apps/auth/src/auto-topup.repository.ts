export type StoredAutoTopUp = {
  tenantId: string;
  enabled: boolean;
  thresholdKobo: number;
  topupAmountKobo: number;
  paymentProvider: string;
  mobileNumber: string | null;
  updatedAt: Date;
};

export interface AutoTopUpRepository {
  findByTenantId(tenantId: string): Promise<StoredAutoTopUp | null>;
  save(settings: StoredAutoTopUp): Promise<void>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export const AUTO_TOP_UP_REPOSITORY = Symbol('AUTO_TOP_UP_REPOSITORY');
