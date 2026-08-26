import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  CustomerInvoice,
  applyTax,
  type InvoiceSettingsSnapshot,
} from "../../domain/entities/customer-invoice.entity";
import type { Waybill } from "../../domain/entities/waybill.entity";
import { WaybillNotFoundError } from "../../domain/errors/waybill.errors";
import {
  CUSTOMER_INVOICE_REPOSITORY,
  type CustomerInvoiceRepository,
} from "../../domain/repositories/customer-invoice.repository";
import {
  DEFAULT_INVOICE_PREFIX,
  DEFAULT_PAYMENT_TERMS_DAYS,
  INVOICE_SETTINGS_REPOSITORY,
  type InvoiceSettingsRepository,
} from "../../domain/repositories/invoice-settings.repository";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";

export type GenerateInvoiceCommand = {
  tenantId: string;
  waybillIds: string[];
};

/**
 * Builds a draft invoice from priced waybills.
 *
 * The draft takes a draft number, not a real one. A draft that is built and
 * then binned would otherwise consume a number from the real sequence and leave
 * a hole in it, and the sequence has to be gapless.
 */
@Injectable()
export class GenerateInvoiceUseCase {
  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(CUSTOMER_INVOICE_REPOSITORY) private readonly invoices: CustomerInvoiceRepository,
    @Inject(INVOICE_SETTINGS_REPOSITORY) private readonly settings: InvoiceSettingsRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: GenerateInvoiceCommand): Promise<CustomerInvoice> {
    const waybills = await this.loadInvoiceable(command);
    const snapshot = await this.snapshotSettings(command.tenantId);

    const subtotalKobo = waybills.reduce((sum, waybill) => sum + (waybill.priceKobo ?? 0), 0);
    const { taxKobo, totalKobo } = applyTax(
      subtotalKobo,
      snapshot.taxEnabled,
      snapshot.taxRateBasisPoints,
    );

    const now = new Date();
    const sequence = await this.invoices.allocateNumber(
      command.tenantId,
      "draft",
      now.getUTCFullYear(),
    );

    const invoiceId = this.runtime.generateId();
    const invoice = CustomerInvoice.create({
      id: invoiceId,
      tenantId: command.tenantId,
      invoiceNumber: `${snapshot.invoicePrefix}-DRAFT-${String(sequence).padStart(3, "0")}`,
      status: "draft",
      customerName: waybills[0].customerName ?? "",
      origin: waybills[0].origin,
      destination: waybills[0].destination,
      vehicleRegistration: waybills[0].vehicleRegistration,
      subtotalKobo,
      taxKobo,
      totalKobo,
      currency: "NGN",
      issuedAt: null,
      dueAt: null,
      sentTo: null,
      sentAt: null,
      paidAt: null,
      paymentReference: null,
      settingsSnapshot: snapshot,
    });

    await this.invoices.save(invoice);

    // Marked after the invoice exists, so a failure cannot leave waybills
    // pointing at an invoice that was never written.
    for (const waybill of waybills) {
      await this.waybills.save(waybill.markInvoiced(invoiceId));
    }

    return invoice;
  }

  private async loadInvoiceable(command: GenerateInvoiceCommand): Promise<Waybill[]> {
    if (command.waybillIds.length === 0) {
      throw new FleetRuleError("at least one waybill is required");
    }

    const waybills: Waybill[] = [];
    for (const id of [...new Set(command.waybillIds)]) {
      const waybill = await this.waybills.findById(id, command.tenantId);
      if (!waybill) throw new WaybillNotFoundError(id);
      if (waybill.status === "invoiced") {
        throw new FleetRuleError(`waybill ${id} is already on an invoice`);
      }
      if (waybill.status !== "priced") {
        throw new FleetRuleError(`waybill ${id} has no price yet`);
      }
      waybills.push(waybill);
    }

    // One invoice bills one customer. Combining two customers onto one invoice
    // produces a bill neither of them owes in full.
    const customers = new Set(
      waybills.map((waybill) => (waybill.customerName ?? "").trim().toLowerCase()),
    );
    if (customers.size > 1) {
      throw new FleetRuleError("all waybills on an invoice must be for the same customer");
    }
    if (!waybills[0].customerName) {
      throw new FleetRuleError("the waybills have no customer to invoice");
    }

    return waybills;
  }

  /**
   * Freezes the tenant's settings onto the invoice.
   *
   * Read once, here, and never again. Changing the prefix or the payment terms
   * later must not alter an invoice already issued.
   */
  private async snapshotSettings(tenantId: string): Promise<InvoiceSettingsSnapshot> {
    const stored = await this.settings.find(tenantId);
    if (!stored) {
      throw new FleetRuleError("invoice settings must be filled in before invoicing");
    }

    return {
      companyName: stored.companyName,
      address: stored.address,
      phone: stored.phone,
      email: stored.email,
      bankName: stored.bankName,
      accountName: stored.accountName,
      accountNumber: stored.accountNumber,
      invoicePrefix: stored.invoicePrefix || DEFAULT_INVOICE_PREFIX,
      paymentTermsDays: stored.paymentTermsDays || DEFAULT_PAYMENT_TERMS_DAYS,
      taxEnabled: stored.taxEnabled,
      taxRateBasisPoints: stored.taxRateBasisPoints,
      notes: stored.defaultNotes,
    };
  }
}
