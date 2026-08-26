import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type {
  InvoiceSettingsRepository,
  StoredInvoiceSettings,
} from "../../domain/repositories/invoice-settings.repository";
import {
  InvoiceSettingsRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroInvoiceSettingsRepository implements InvoiceSettingsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async find(tenantId: string): Promise<StoredInvoiceSettings | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(InvoiceSettingsRecord, { tenantId });
    if (!record) return null;

    return {
      tenantId: record.tenantId,
      companyName: record.companyName,
      address: record.address ?? null,
      phone: record.phone ?? null,
      email: record.email ?? null,
      taxEnabled: record.taxEnabled,
      taxRateBasisPoints: record.taxRateBasisPoints,
      bankName: record.bankName ?? null,
      accountName: record.accountName ?? null,
      accountNumber: record.accountNumber ?? null,
      invoicePrefix: record.invoicePrefix,
      paymentTermsDays: record.paymentTermsDays,
      defaultNotes: record.defaultNotes ?? null,
    };
  }

  async save(settings: StoredInvoiceSettings): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().upsert(InvoiceSettingsRecord, {
      ...settings,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
