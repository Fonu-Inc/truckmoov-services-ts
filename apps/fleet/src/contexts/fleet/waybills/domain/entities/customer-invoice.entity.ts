import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";

export const INVOICE_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "sent",
  "paid",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return INVOICE_STATUSES.includes(value as InvoiceStatus);
}

/**
 * What the tenant's settings said when the invoice was issued.
 *
 * Snapshotted rather than read live: changing the invoice prefix or the payment
 * terms must not alter an invoice already sent to a customer.
 */
export type InvoiceSettingsSnapshot = {
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  invoicePrefix: string;
  paymentTermsDays: number;
  taxEnabled: boolean;
  taxRateBasisPoints: number;
  notes: string | null;
};

export type CustomerInvoiceProps = {
  id: string;
  tenantId: string;
  /** DRAFT-nnn until approved, then the real gapless number. */
  invoiceNumber: string;
  status: InvoiceStatus;
  customerName: string;
  origin: string | null;
  destination: string | null;
  vehicleRegistration: string | null;
  subtotalKobo: number;
  taxKobo: number;
  totalKobo: number;
  currency: string;
  /** When the real number was taken. Null while the invoice is still a draft. */
  issuedAt: string | null;
  dueAt: string | null;
  sentTo: string | null;
  sentAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  settingsSnapshot: InvoiceSettingsSnapshot;
  createdAt?: string;
  updatedAt?: string;
};

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["pending_review", "approved"],
  pending_review: ["approved"],
  approved: ["sent"],
  sent: ["paid"],
  paid: [],
};

export class CustomerInvoice {
  private constructor(private readonly props: CustomerInvoiceProps) {}

  static create(props: CustomerInvoiceProps): CustomerInvoice {
    if (!props.id.trim()) throw new FleetRuleError("id is required");
    if (!props.tenantId.trim()) throw new FleetRuleError("tenantId is required");
    if (!props.invoiceNumber.trim()) throw new FleetRuleError("an invoice number is required");
    if (!props.customerName.trim()) throw new FleetRuleError("a customer is required");
    if (!isInvoiceStatus(props.status)) {
      throw new FleetRuleError(`status must be one of: ${INVOICE_STATUSES.join(", ")}`);
    }
    if (!Number.isInteger(props.subtotalKobo) || props.subtotalKobo < 0) {
      throw new FleetRuleError("subtotalKobo must be a whole number of kobo");
    }

    const now = new Date().toISOString();
    return new CustomerInvoice({
      ...props,
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      invoiceNumber: props.invoiceNumber.trim(),
      customerName: props.customerName.trim(),
      currency: props.currency?.trim() || "NGN",
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get invoiceNumber() { return this.props.invoiceNumber; }
  get status() { return this.props.status; }
  get customerName() { return this.props.customerName; }
  get origin() { return this.props.origin; }
  get destination() { return this.props.destination; }
  get vehicleRegistration() { return this.props.vehicleRegistration; }
  get subtotalKobo() { return this.props.subtotalKobo; }
  get taxKobo() { return this.props.taxKobo; }
  get totalKobo() { return this.props.totalKobo; }
  get currency() { return this.props.currency; }
  get issuedAt() { return this.props.issuedAt; }
  get dueAt() { return this.props.dueAt; }
  get sentTo() { return this.props.sentTo; }
  get sentAt() { return this.props.sentAt; }
  get paidAt() { return this.props.paidAt; }
  get paymentReference() { return this.props.paymentReference; }
  get settingsSnapshot() { return this.props.settingsSnapshot; }
  get createdAt() { return this.props.createdAt ?? new Date().toISOString(); }
  get updatedAt() { return this.props.updatedAt ?? this.createdAt; }

  /**
   * Overdue is derived, never stored.
   *
   * A stored flag needs a sweep to maintain, and a sweep that misses a run
   * leaves an invoice reading as current when it is weeks late.
   */
  isOverdue(now = new Date()): boolean {
    if (this.status !== "sent" || !this.dueAt) return false;
    return Date.parse(this.dueAt) < now.getTime();
  }

  /** What the screen shows, which includes the derived overdue state. */
  displayStatus(now = new Date()): InvoiceStatus | "overdue" {
    return this.isOverdue(now) ? "overdue" : this.status;
  }

  /**
   * Approval is where a draft becomes a real invoice.
   *
   * The gapless number is taken here rather than at creation: a draft that is
   * built and then binned would otherwise burn a number and leave a hole in the
   * sequence, which is the one thing invoice numbering may not do.
   */
  approve(input: { invoiceNumber: string; at?: string }): CustomerInvoice {
    this.assertCanTransitionTo("approved");
    const at = input.at ?? new Date().toISOString();
    const dueAt = new Date(
      Date.parse(at) + this.settingsSnapshot.paymentTermsDays * 24 * 60 * 60 * 1000,
    );

    return CustomerInvoice.create({
      ...this.props,
      status: "approved",
      invoiceNumber: input.invoiceNumber,
      issuedAt: at,
      dueAt: dueAt.toISOString().slice(0, 10),
      updatedAt: at,
    });
  }

  submitForReview(at?: string): CustomerInvoice {
    this.assertCanTransitionTo("pending_review");
    return CustomerInvoice.create({
      ...this.props,
      status: "pending_review",
      updatedAt: at ?? new Date().toISOString(),
    });
  }

  markSent(input: { to: string; at?: string }): CustomerInvoice {
    this.assertCanTransitionTo("sent");
    if (!input.to.trim()) throw new FleetRuleError("a recipient is required");

    const at = input.at ?? new Date().toISOString();
    return CustomerInvoice.create({
      ...this.props,
      status: "sent",
      sentTo: input.to.trim(),
      sentAt: at,
      updatedAt: at,
    });
  }

  markPaid(input: { paidAt: string; reference: string | null }): CustomerInvoice {
    this.assertCanTransitionTo("paid");
    if (Number.isNaN(Date.parse(input.paidAt))) {
      throw new FleetRuleError("a valid payment date is required");
    }

    return CustomerInvoice.create({
      ...this.props,
      status: "paid",
      paidAt: input.paidAt,
      paymentReference: input.reference?.trim() || null,
      updatedAt: new Date().toISOString(),
    });
  }

  private assertCanTransitionTo(next: InvoiceStatus): void {
    if (!ALLOWED_TRANSITIONS[this.status].includes(next)) {
      throw new FleetRuleError(`an invoice cannot go from ${this.status} to ${next}`);
    }
  }

  toPrimitives(): CustomerInvoiceProps {
    return { ...this.props };
  }
}

/**
 * Splits a total into its tax and net parts.
 *
 * Tax is added on top of the waybill prices, and rounded once at the end rather
 * than per line, so a ten-line invoice and a one-line invoice of the same value
 * come to the same total.
 */
export function applyTax(
  subtotalKobo: number,
  taxEnabled: boolean,
  taxRateBasisPoints: number,
): { taxKobo: number; totalKobo: number } {
  if (!taxEnabled || taxRateBasisPoints <= 0) {
    return { taxKobo: 0, totalKobo: subtotalKobo };
  }

  const taxKobo = Math.round((subtotalKobo * taxRateBasisPoints) / 10_000);
  return { taxKobo, totalKobo: subtotalKobo + taxKobo };
}
