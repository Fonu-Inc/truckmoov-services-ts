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
  extractedFields: ExtractedFields;
  extractionError: string | null;
  invoiceId: string | null;
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
    capturedAt?: string;
  }): Waybill {
    const at = input.capturedAt ?? new Date().toISOString();
    return Waybill.create({
      id: input.id,
      tenantId: input.tenantId,
      source: input.source,
      status: "pending",
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
      extractedFields: {},
      extractionError: null,
      invoiceId: null,
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
  get extractedFields() { return this.props.extractedFields; }
  get extractionError() { return this.props.extractionError; }
  get invoiceId() { return this.props.invoiceId; }
  get createdAt() { return this.props.createdAt ?? new Date().toISOString(); }
  get updatedAt() { return this.props.updatedAt ?? this.createdAt; }

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
