export const PRICE_CHANGE_ITEM_TYPES = ['m2m_plan', 'installation_fee'] as const;
export type PriceChangeItemType = (typeof PRICE_CHANGE_ITEM_TYPES)[number];

export const PRICE_CHANGE_FIELDS = [
  'year1',
  'renewal',
  'enterprise',
  'owner_operator',
] as const;
export type PriceChangeField = (typeof PRICE_CHANGE_FIELDS)[number];

export type StoredBillingPriceChange = {
  id: string;
  itemType: PriceChangeItemType;
  itemRef: string;
  field: PriceChangeField;
  oldPriceNgn: number;
  newPriceNgn: number;
  effectiveDate: string;
  reason: string;
  changedByUserId: string;
  changedByName: string;
  createdAt: Date;
};

export type BillingPriceChangeFilter = {
  itemType?: PriceChangeItemType;
  itemRef?: string;
  page: number;
  limit: number;
};

export interface BillingPriceChangeRepository {
  list(
    filter: BillingPriceChangeFilter,
  ): Promise<{ items: StoredBillingPriceChange[]; total: number }>;
}

export const BILLING_PRICE_CHANGE_REPOSITORY = Symbol(
  'BILLING_PRICE_CHANGE_REPOSITORY',
);
