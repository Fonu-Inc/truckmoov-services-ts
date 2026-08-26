export type WaybillExtractionJob = {
  waybillId: string;
  tenantId: string;
  imageKey: string;
};

/**
 * Hands a captured waybill to whatever reads the photo.
 *
 * Queued rather than called inline. Extraction takes seconds and can fail, and
 * the upload must return as soon as the bytes are safe — the screen expects the
 * row to appear immediately as pending and to change later.
 */
export interface WaybillExtractionQueue {
  enqueue(job: WaybillExtractionJob): Promise<void>;
}

export const WAYBILL_EXTRACTION_QUEUE = Symbol("WAYBILL_EXTRACTION_QUEUE");
