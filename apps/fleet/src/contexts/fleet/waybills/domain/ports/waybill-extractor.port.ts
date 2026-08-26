import type { ExtractedFields } from "../entities/waybill.entity";

export type WaybillExtractionResult =
  | { ok: true; fields: ExtractedFields }
  | { ok: false; reason: string };

/**
 * Reads the fields off a waybill photo.
 *
 * Behind a port because the platform has no extractor configured yet, and
 * because whichever one is chosen — a hosted OCR, a vision model, a local
 * service — must not reach into the waybill workflow.
 */
export interface WaybillExtractor {
  extract(input: { imageKey: string; tenantId: string }): Promise<WaybillExtractionResult>;
}

export const WAYBILL_EXTRACTOR = Symbol("WAYBILL_EXTRACTOR");
