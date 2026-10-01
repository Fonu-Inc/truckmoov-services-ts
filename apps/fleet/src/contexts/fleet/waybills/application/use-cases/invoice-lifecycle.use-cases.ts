import { Inject, Injectable } from "@nestjs/common";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import type { CustomerInvoice } from "../../domain/entities/customer-invoice.entity";
import {
  CUSTOMER_INVOICE_REPOSITORY,
  type CustomerInvoiceRepository,
} from "../../domain/repositories/customer-invoice.repository";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";
import { isOnAllowedVehicle } from "../../domain/vehicle-registration";

export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice ${id} not found`);
    this.name = "InvoiceNotFoundError";
  }
}

/** Null means no limit; otherwise the invoice must be on one of these vehicles. */
type AllowedRegistrations = { allowedRegistrationKeys?: ReadonlySet<string> | null };

async function loadInvoice(
  invoices: CustomerInvoiceRepository,
  input: { invoiceId: string; tenantId: string } & AllowedRegistrations,
): Promise<CustomerInvoice> {
  const invoice = await invoices.findById(input.invoiceId, input.tenantId);
  // Another owner's invoice reads as missing, not as forbidden.
  if (!invoice || !isOnAllowedVehicle(invoice.vehicleRegistration, input.allowedRegistrationKeys)) {
    throw new InvoiceNotFoundError(input.invoiceId);
  }
  return invoice;
}

@Injectable()
export class ApproveInvoiceUseCase {
  constructor(
    @Inject(CUSTOMER_INVOICE_REPOSITORY) private readonly invoices: CustomerInvoiceRepository,
  ) {}

  /**
   * Approval is where the real, gapless number is taken.
   *
   * Deliberately not at creation: a binned draft would otherwise burn a number
   * and leave a hole an auditor would ask about.
   */
  async execute(input: { invoiceId: string; tenantId: string } & AllowedRegistrations): Promise<CustomerInvoice> {
    const invoice = await loadInvoice(this.invoices, input);

    const issuedAt = new Date();
    const year = issuedAt.getUTCFullYear();
    const sequence = await this.invoices.allocateNumber(input.tenantId, "invoice", year);
    const prefix = invoice.settingsSnapshot.invoicePrefix;

    const approved = invoice.approve({
      invoiceNumber: `${prefix}-${year}-${String(sequence).padStart(4, "0")}`,
      at: issuedAt.toISOString(),
    });
    await this.invoices.save(approved);
    return approved;
  }
}

@Injectable()
export class SendInvoiceUseCase {
  constructor(
    @Inject(CUSTOMER_INVOICE_REPOSITORY) private readonly invoices: CustomerInvoiceRepository,
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
  ) {}

  /**
   * Records that the invoice went out, and to where.
   *
   * With no customer record to look an address up in, the default is the
   * channel the waybill arrived on. A caller may override it.
   */
  async execute(input: {
    invoiceId: string;
    tenantId: string;
    to?: string | null;
  } & AllowedRegistrations): Promise<CustomerInvoice> {
    const invoice = await loadInvoice(this.invoices, input);

    const recipient = input.to?.trim() || (await this.replyAddressFor(invoice));
    if (!recipient) {
      throw new FleetRuleError(
        "no recipient: the waybill recorded no reply address, so one must be given",
      );
    }

    const sent = invoice.markSent({ to: recipient });
    await this.invoices.save(sent);
    return sent;
  }

  private async replyAddressFor(invoice: CustomerInvoice): Promise<string | null> {
    const { items } = await this.waybills.search({
      tenantId: invoice.tenantId,
      status: "invoiced",
      limit: 100,
    });
    const source = items.find((waybill) => waybill.invoiceId === invoice.id);
    return source?.replyAddress ?? null;
  }
}

@Injectable()
export class MarkInvoicePaidUseCase {
  constructor(
    @Inject(CUSTOMER_INVOICE_REPOSITORY) private readonly invoices: CustomerInvoiceRepository,
  ) {}

  async execute(input: {
    invoiceId: string;
    tenantId: string;
    paidAt: string;
    reference: string | null;
  } & AllowedRegistrations): Promise<CustomerInvoice> {
    const invoice = await loadInvoice(this.invoices, input);

    const paid = invoice.markPaid({ paidAt: input.paidAt, reference: input.reference });
    await this.invoices.save(paid);
    return paid;
  }
}
