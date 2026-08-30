import { createHash } from "node:crypto";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";

/**
 * How a waybill reached us. Kept because the three arrive with very different
 * confidence: a manual entry is already correct, a photo is a guess until a
 * person confirms it.
 */
export const WAYBILL_SOURCES = ["upload", "whatsapp", "manual"] as const;

export type WaybillSource = (typeof WAYBILL_SOURCES)[number];

/**
 * pending  — captured, extraction not finished
 * extracted — fields read with enough confidence to price
 * needs_review — extraction failed or was unsure, a person must confirm
 * priced   — a pricing rule matched and set the price
 * invoiced — rolled into a customer invoice
 */
export const WAYBILL_STATUSES = [
  "pending",
  "extracted",
  "needs_review",
  "priced",
  "invoiced",
] as const;

export type WaybillStatus = (typeof WAYBILL_STATUSES)[number];

export function isWaybillSource(value: string): value is WaybillSource {
  return WAYBILL_SOURCES.includes(value as WaybillSource);
}

export function isWaybillStatus(value: string): value is WaybillStatus {
  return WAYBILL_STATUSES.includes(value as WaybillStatus);
}

/**
 * One field extraction produced, with how sure it was.
 *
 * Confidence is kept per field rather than per document because extraction is
 * rarely wrong about everything at once: a reviewer needs to see which two
 * fields to correct, not that the page as a whole scored 0.6.
 */
export type ExtractedField = {
  value: string | null;
  confidence: number;
};

export type ExtractedFields = Record<string, ExtractedField>;

export type WaybillProps = {
  id: string;
  tenantId: string;
  source: WaybillSource;
  status: WaybillStatus;
  /** Tenant-unique once known. Null until extraction or manual entry supplies it. */
  waybillNumber: string | null;
  origin: string | null;
  destination: string | null;
  vehicleRegistration: string | null;
  customerName: string | null;
  /** Minor units, like every other amount on the platform. */
  priceKobo: number | null;
  /** The rule that set the price, kept so a later rule change cannot rewrite history. */
  pricingRuleId: string | null;
  weight: number | null;
  weightUnit: string | null;
  /** The date on the document, which is what prices it — not the day it was captured. */
  waybillDate: string | null;
  imageKey: string | null;
  /** SHA-256 of the bytes we stored, so a later reader can prove the image is the one captured. */
  imageSha256: string | null;
  imageBytes: number | null;
  /** The driver the image was attributed to at capture, e.g. resolved from a WhatsApp sender. Null when unknown. */
  driverId: string | null;
  extractedFields: ExtractedFields;
  extractionError: string | null;
  invoiceId: string | null;
  /**
   * Where an invoice built from this waybill goes back to, captured when the
   * waybill arrived. There is no customer record to look an address up in, so
   * the channel it came in on is the address we have.
   */
  replyChannel?: "whatsapp" | "email" | null;
  replyAddress?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export class Waybill {
  private constructor(private readonly props: WaybillProps) {}

  static create(props: WaybillProps): Waybill {
    if (!props.id.trim()) throw new FleetRuleError("id is required");
    if (!props.tenantId.trim()) throw new FleetRuleError("tenantId is required");
    if (!isWaybillSource(props.source)) {
      throw new FleetRuleError(`source must be one of: ${WAYBILL_SOURCES.join(", ")}`);
    }
    if (!isWaybillStatus(props.status)) {
      throw new FleetRuleError(`status must be one of: ${WAYBILL_STATUSES.join(", ")}`);
    }
    if (props.waybillDate && Number.isNaN(Date.parse(props.waybillDate))) {
      throw new FleetRuleError("waybillDate must be a valid ISO date");
    }
    if (props.priceKobo !== null && !Number.isInteger(props.priceKobo)) {
      throw new FleetRuleError("priceKobo must be a whole number of kobo");
    }
    if (props.priceKobo !== null && props.priceKobo < 0) {
      throw new FleetRuleError("priceKobo cannot be negative");
    }
    if (props.status === "invoiced" && !props.invoiceId) {
      throw new FleetRuleError("an invoiced waybill must reference its invoice");
    }

    const now = new Date().toISOString();
    return new Waybill({
      ...props,
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      waybillNumber: props.waybillNumber?.trim() || null,
      origin: props.origin?.trim() || null,
      destination: props.destination?.trim() || null,
      vehicleRegistration: props.vehicleRegistration?.trim() || null,
      customerName: props.customerName?.trim() || null,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  /** A freshly captured waybill. Nothing is known about it yet beyond the image. */
  static capture(input: {
    id: string;
    tenantId: string;
    source: WaybillSource;
    imageKey: string;
    imageSha256: string;
    imageBytes: number;
    driverId?: string | null;
    replyChannel?: "whatsapp" | "email" | null;
    replyAddress?: string | null;
    capturedAt?: string;
  }): Waybill {
    const at = input.capturedAt ?? new Date().toISOString();
    // A WhatsApp image from a number nobody recognizes still becomes a waybill —
    // dropping it would lose real freight paperwork — but it needs a person to
    // say whose it is before it can be trusted the way a driver-attributed one is.
    const unresolvedWhatsappSender = input.source === "whatsapp" && !input.driverId;
    return Waybill.create({
      id: input.id,
      tenantId: input.tenantId,
      source: input.source,
      status: unresolvedWhatsappSender ? "needs_review" : "pending",
      waybillNumber: null,
      origin: null,
      destination: null,
      vehicleRegistration: null,
      customerName: null,
      priceKobo: null,
      pricingRuleId: null,
      weight: null,
      weightUnit: null,
      waybillDate: null,
      imageKey: input.imageKey,
      imageSha256: input.imageSha256,
      imageBytes: input.imageBytes,
      driverId: input.driverId ?? null,
      extractedFields: {},
      extractionError: unresolvedWhatsappSender
        ? "whatsapp sender is not a known driver"
        : null,
      invoiceId: null,
      replyChannel: input.replyChannel ?? null,
      replyAddress: input.replyAddress ?? null,
      createdAt: at,
      updatedAt: at,
    });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get source() { return this.props.source; }
  get status() { return this.props.status; }
  get waybillNumber() { return this.props.waybillNumber; }
  get origin() { return this.props.origin; }
  get destination() { return this.props.destination; }
  get vehicleRegistration() { return this.props.vehicleRegistration; }
  get customerName() { return this.props.customerName; }
  get priceKobo() { return this.props.priceKobo; }
  get pricingRuleId() { return this.props.pricingRuleId; }
  get weight() { return this.props.weight; }
  get weightUnit() { return this.props.weightUnit; }
  get waybillDate() { return this.props.waybillDate; }
  get imageKey() { return this.props.imageKey; }
  get imageSha256() { return this.props.imageSha256; }
  get imageBytes() { return this.props.imageBytes; }
  get driverId() { return this.props.driverId; }
  get extractedFields() { return this.props.extractedFields; }
  get extractionError() { return this.props.extractionError; }
  get invoiceId() { return this.props.invoiceId; }
  get replyChannel() { return this.props.replyChannel ?? null; }
  get replyAddress() { return this.props.replyAddress ?? null; }
  get createdAt() { return this.props.createdAt ?? new Date().toISOString(); }
  get updatedAt() { return this.props.updatedAt ?? this.createdAt; }

  /**
   * States where extraction may still write. A waybill that is already priced
   * or invoiced is settled business, and a redelivered job must not rewrite it.
   */
  get acceptsExtraction(): boolean {
    return this.status === "pending" || this.status === "needs_review";
  }

  /**
   * Applies what extraction read.
   *
   * Every field has to clear the confidence bar, not the document on average.
   * One unreadable destination on an otherwise clean scan still prices the
   * waybill wrongly, and pricing is what turns it into money owed.
   */
  applyExtraction(input: {
    fields: ExtractedFields;
    confidenceThreshold: number;
    /** Forces review whatever the confidence, e.g. a number another waybill holds. */
    forcedReviewReason?: string | null;
    at?: string;
  }): Waybill {
    if (!this.acceptsExtraction) {
      throw new FleetRuleError(`extraction cannot be applied to a ${this.status} waybill`);
    }

    const at = input.at ?? new Date().toISOString();
    const confident = Object.values(input.fields).every(
      (field) => field.value !== null && field.confidence >= input.confidenceThreshold,
    );
    const hasFields = Object.keys(input.fields).length > 0;

    // An unattributed WhatsApp sender is a review reason of its own: extraction
    // reading the page cleanly says nothing about whose freight it is.
    const unresolvedWhatsappSender = this.source === "whatsapp" && !this.driverId;
    const forced =
      input.forcedReviewReason?.trim()
      || (unresolvedWhatsappSender ? "whatsapp sender is not a known driver" : null);

    return Waybill.create({
      ...this.toPrimitives(),
      status: !forced && hasFields && confident ? "extracted" : "needs_review",
      waybillNumber: readField(input.fields, "waybillNumber") ?? this.waybillNumber,
      origin: readField(input.fields, "origin") ?? this.origin,
      destination: readField(input.fields, "destination") ?? this.destination,
      vehicleRegistration:
        readField(input.fields, "vehicleRegistration") ?? this.vehicleRegistration,
      customerName: readField(input.fields, "customerName") ?? this.customerName,
      weight: readNumberField(input.fields, "weight") ?? this.weight,
      weightUnit: readField(input.fields, "weightUnit") ?? this.weightUnit,
      waybillDate: readDateField(input.fields, "waybillDate") ?? this.waybillDate,
      extractedFields: input.fields,
      extractionError: forced,
      updatedAt: at,
    });
  }

  /** Extraction could not run or could not read the page. A person takes over. */
  failExtraction(reason: string, at?: string): Waybill {
    if (!this.acceptsExtraction) {
      throw new FleetRuleError(`extraction cannot be applied to a ${this.status} waybill`);
    }

    return Waybill.create({
      ...this.toPrimitives(),
      status: "needs_review",
      extractionError: reason.trim() || "extraction failed",
      updatedAt: at ?? new Date().toISOString(),
    });
  }

  /**
   * A person confirmed or corrected the fields.
   *
   * The result is trusted outright: a human reading the page is the highest
   * confidence available, so the waybill leaves review even where extraction
   * was unsure.
   */
  applyReview(values: {
    waybillNumber?: string | null;
    origin?: string | null;
    destination?: string | null;
    vehicleRegistration?: string | null;
    customerName?: string | null;
    weight?: number | null;
    weightUnit?: string | null;
    waybillDate?: string | null;
    at?: string;
  }): Waybill {
    if (this.status === "invoiced") {
      throw new FleetRuleError("an invoiced waybill cannot be edited");
    }

    return Waybill.create({
      ...this.toPrimitives(),
      status: "extracted",
      waybillNumber: pick(values.waybillNumber, this.waybillNumber),
      origin: pick(values.origin, this.origin),
      destination: pick(values.destination, this.destination),
      vehicleRegistration: pick(values.vehicleRegistration, this.vehicleRegistration),
      customerName: pick(values.customerName, this.customerName),
      weight: values.weight === undefined ? this.weight : values.weight,
      weightUnit: pick(values.weightUnit, this.weightUnit),
      waybillDate: pick(values.waybillDate, this.waybillDate),
      extractionError: null,
      updatedAt: values.at ?? new Date().toISOString(),
    });
  }

  /**
   * Records the price a rule put on this load.
   *
   * The rule id and the amount are both stored. Nothing recomputes a price on
   * read, so deactivating or editing a rule later cannot change what a customer
   * was already told they owed.
   */
  applyPrice(input: { priceKobo: number; pricingRuleId: string; at?: string }): Waybill {
    if (this.status === "invoiced") {
      throw new FleetRuleError("an invoiced waybill cannot be repriced");
    }
    if (!Number.isInteger(input.priceKobo) || input.priceKobo <= 0) {
      throw new FleetRuleError("a price must be a positive whole number of kobo");
    }

    return Waybill.create({
      ...this.toPrimitives(),
      status: "priced",
      priceKobo: input.priceKobo,
      pricingRuleId: input.pricingRuleId,
      updatedAt: input.at ?? new Date().toISOString(),
    });
  }

  /** Rolled into an invoice. A waybill may only ever be on one. */
  markInvoiced(invoiceId: string, at?: string): Waybill {
    if (this.status === "invoiced") {
      throw new FleetRuleError("this waybill is already on an invoice");
    }
    if (this.status !== "priced") {
      throw new FleetRuleError("only a priced waybill can be invoiced");
    }

    return Waybill.create({
      ...this.toPrimitives(),
      status: "invoiced",
      invoiceId,
      updatedAt: at ?? new Date().toISOString(),
    });
  }

  toPrimitives(): WaybillProps {
    return { ...this.props };
  }
}

/**
 * Fingerprints the bytes as they arrive.
 *
 * A waybill becomes an invoice line and then money owed, so the image behind it
 * has to be provably the one that was captured. Hashing at capture means a
 * later dispute compares against a value written before anyone had a reason to
 * change it.
 */
export function hashWaybillImage(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function pick(next: string | null | undefined, current: string | null): string | null {
  return next === undefined ? current : (next?.trim() || null);
}

function readField(fields: ExtractedFields, key: string): string | null {
  const value = fields[key]?.value?.trim();
  return value ? value : null;
}

function readNumberField(fields: ExtractedFields, key: string): number | null {
  const raw = readField(fields, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDateField(fields: ExtractedFields, key: string): string | null {
  const raw = readField(fields, key);
  if (raw === null || Number.isNaN(Date.parse(raw))) return null;
  // Stored as a calendar date. The document carries a day, not an instant.
  return new Date(raw).toISOString().slice(0, 10);
}
