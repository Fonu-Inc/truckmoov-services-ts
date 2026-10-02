export type StoredBundleTransaction = {
  id: string;
  tenantId: string;
  mobileNumber: string;
  bundleId: string;
  amountKobo: number;
  status: string;
  paymentReference: string | null;
  failureReason: string | null;
  createdAt: Date;
};

export type BundleTransactionFilters = {
  tenantId?: string;
  search?: string;
  status?: string;
  bundleIds?: string[];
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
};

export interface BundleTransactionRepository {
  findAll(filters?: BundleTransactionFilters): Promise<{ items: StoredBundleTransaction[]; total: number }>;
  save(transaction: StoredBundleTransaction): Promise<void>;
  sumByDate(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; amountKobo: number }>>;
  sumByBundle(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ bundleId: string; amountKobo: number }>>;
  sumByCarrier(tenantId: string, startDate: Date, endDate: Date, bundles: Array<{ id: string; carrierId: string }>): Promise<Array<{ carrierId: string; amountKobo: number }>>;
  sumTotalByTenantAndMonth(tenantId: string, year: number, month: number): Promise<number>;
  countByTenantAndMonth(tenantId: string, year: number, month: number): Promise<number>;
}

export const BUNDLE_TRANSACTION_REPOSITORY = Symbol('BUNDLE_TRANSACTION_REPOSITORY');
