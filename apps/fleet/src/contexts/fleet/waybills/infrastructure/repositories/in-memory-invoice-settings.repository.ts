import { Injectable } from "@nestjs/common";
import type {
  InvoiceSettingsRepository,
  StoredInvoiceSettings,
} from "../../domain/repositories/invoice-settings.repository";

@Injectable()
export class InMemoryInvoiceSettingsRepository implements InvoiceSettingsRepository {
  private readonly data = new Map<string, StoredInvoiceSettings>();

  async find(tenantId: string): Promise<StoredInvoiceSettings | null> {
    return this.data.get(tenantId) ?? null;
  }

  async save(settings: StoredInvoiceSettings): Promise<void> {
    this.data.set(settings.tenantId, settings);
  }
}
