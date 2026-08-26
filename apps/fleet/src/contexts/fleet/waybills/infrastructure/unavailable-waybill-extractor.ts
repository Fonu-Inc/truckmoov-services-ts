import { Injectable } from "@nestjs/common";
import type {
  WaybillExtractionResult,
  WaybillExtractor,
} from "../domain/ports/waybill-extractor.port";

/**
 * Stands in until an extractor is configured.
 *
 * It reports that it cannot read the page rather than returning empty fields
 * with high confidence. The waybill then lands in review, where a person
 * enters the fields — which is what actually happens today, and is honest
 * about it. Returning invented values would price a real trip off a guess.
 */
@Injectable()
export class UnavailableWaybillExtractor implements WaybillExtractor {
  async extract(): Promise<WaybillExtractionResult> {
    return {
      ok: false,
      reason: "No extraction service is configured. Enter the fields by hand.",
    };
  }
}
