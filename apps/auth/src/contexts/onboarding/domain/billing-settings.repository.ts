import type { StoredBillingPriceChange } from './billing-price-change.repository';

export const BILLING_SETTING_KEYS = {
  installationFeeEnterprise: 'installation_fee_enterprise_ngn',
  installationFeeOwnerOperator: 'installation_fee_owner_operator_ngn',
  telecomMasterSim: 'telecom_master_sim_ngn',
  defaultTaxRatePct: 'default_tax_rate_pct',
  quoteValidityDays: 'quote_validity_days',
  invoiceDueDays: 'invoice_due_days',
} as const;

export type StoredBillingSetting = {
  key: string;
  value: number;
  updatedAt: Date;
  updatedBy: string | null;
};

export type BillingSettingUpdate = { key: string; value: number };

export type PricedSettingsEdit = {
  updates: BillingSettingUpdate[];
  changes: StoredBillingPriceChange[];
};

export interface BillingSettingsRepository {
  getAll(): Promise<Record<string, StoredBillingSetting>>;
  /**
   * Serialises concurrent edits, hands the current settings to `build`, and
   * writes the returned updates and price history in the same transaction.
   * `build` returning null writes nothing.
   */
  editPriced(
    updatedBy: string,
    build: (current: Record<string, StoredBillingSetting>) => PricedSettingsEdit | null,
  ): Promise<void>;
  /** Writes the settings and appends their price history in one transaction. */
  savePriced(
    updates: BillingSettingUpdate[],
    updatedBy: string,
    changes: StoredBillingPriceChange[],
  ): Promise<void>;
}

export const BILLING_SETTINGS_REPOSITORY = Symbol(
  'BILLING_SETTINGS_REPOSITORY',
);
