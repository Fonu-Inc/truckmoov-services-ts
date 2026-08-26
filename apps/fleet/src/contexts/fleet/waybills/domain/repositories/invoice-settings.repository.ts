export type StoredInvoiceSettings = {
  tenantId: string;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxEnabled: boolean;
  /** Basis points, so 7.5% is 750 and no fraction is ever stored. */
  taxRateBasisPoints: number;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  invoicePrefix: string;
  paymentTermsDays: number;
  defaultNotes: string | null;
};

export const DEFAULT_INVOICE_PREFIX = "INV";
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export interface InvoiceSettingsRepository {
  find(tenantId: string): Promise<StoredInvoiceSettings | null>;
  save(settings: StoredInvoiceSettings): Promise<void>;
}

export const INVOICE_SETTINGS_REPOSITORY = Symbol("INVOICE_SETTINGS_REPOSITORY");
