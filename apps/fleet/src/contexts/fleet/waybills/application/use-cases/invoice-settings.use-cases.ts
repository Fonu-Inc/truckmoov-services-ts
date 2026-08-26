import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  DEFAULT_INVOICE_PREFIX,
  DEFAULT_PAYMENT_TERMS_DAYS,
  INVOICE_SETTINGS_REPOSITORY,
  type InvoiceSettingsRepository,
  type StoredInvoiceSettings,
} from "../../domain/repositories/invoice-settings.repository";

export type SaveInvoiceSettingsCommand = {
  tenantId: string;
  companyName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxEnabled?: boolean;
  /** Percent as entered on the form, e.g. 7.5. Stored as basis points. */
  taxRatePercent?: number | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  invoicePrefix?: string | null;
  paymentTermsDays?: number | null;
  defaultNotes?: string | null;
};

@Injectable()
export class SaveInvoiceSettingsUseCase {
  constructor(
    @Inject(INVOICE_SETTINGS_REPOSITORY) private readonly settings: InvoiceSettingsRepository,
  ) {}

  async execute(command: SaveInvoiceSettingsCommand): Promise<StoredInvoiceSettings> {
    if (!command.companyName.trim()) {
      throw new FleetRuleError("a company name is required");
    }

    const accountNumber = command.accountNumber?.trim() || null;
    if (accountNumber && !/^\d{10}$/.test(accountNumber)) {
      throw new FleetRuleError("a Nigerian account number is 10 digits");
    }

    const taxEnabled = command.taxEnabled ?? false;
    if (taxEnabled && !command.taxRatePercent) {
      throw new FleetRuleError("a tax rate is required when tax is enabled");
    }

    const settings: StoredInvoiceSettings = {
      tenantId: command.tenantId,
      companyName: command.companyName.trim(),
      address: command.address?.trim() || null,
      phone: command.phone?.trim() || null,
      email: command.email?.trim() || null,
      taxEnabled,
      // Basis points, so 7.5% is 750 and no fraction of a percent is ever lost
      // to a floating point value.
      taxRateBasisPoints: taxEnabled ? Math.round((command.taxRatePercent ?? 0) * 100) : 0,
      bankName: command.bankName?.trim() || null,
      accountName: command.accountName?.trim() || null,
      accountNumber,
      invoicePrefix: command.invoicePrefix?.trim() || DEFAULT_INVOICE_PREFIX,
      paymentTermsDays: command.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS,
      defaultNotes: command.defaultNotes?.trim() || null,
    };

    await this.settings.save(settings);
    return settings;
  }
}

@Injectable()
export class GetInvoiceSettingsUseCase {
  constructor(
    @Inject(INVOICE_SETTINGS_REPOSITORY) private readonly settings: InvoiceSettingsRepository,
  ) {}

  async execute(tenantId: string) {
    const stored = await this.settings.find(tenantId);
    if (!stored) return null;

    return {
      ...stored,
      // Returned as the form shows it, while storage stays in basis points.
      taxRatePercent: stored.taxRateBasisPoints / 100,
    };
  }
}
