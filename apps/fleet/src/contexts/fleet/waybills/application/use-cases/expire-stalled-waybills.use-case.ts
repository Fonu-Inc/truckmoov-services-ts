import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";

/** Bounds one pass so a backlog cannot hold the loop open. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Hands waybills that were never extracted to a person.
 *
 * The capture path deliberately keeps a waybill when the queue is unreachable,
 * which means a row can sit at pending with no job behind it. Nothing else
 * would ever move it, and a waybill nobody looks at is an invoice nobody
 * raises.
 */
@Injectable()
export class ExpireStalledWaybillsUseCase {
  private readonly logger = new Logger(ExpireStalledWaybillsUseCase.name);

  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(now = new Date()): Promise<{ stalled: number }> {
    const cutoff = new Date(
      now.getTime() - this.config.fleet.waybillExtractionStallMinutes * 60_000,
    );

    const candidates = await this.waybills.findPendingCapturedBefore(cutoff, SWEEP_BATCH_SIZE);
    let stalled = 0;
    for (const waybill of candidates) {
      const failed = waybill.failExtraction(
        "Extraction did not run in time. Enter the fields by hand.",
        now.toISOString(),
      );
      if (await this.waybills.failExtractionIfPending(failed)) stalled += 1;
    }

    if (stalled > 0) {
      this.logger.warn(`waybill_extraction_stalled:${stalled}`);
    }
    return { stalled };
  }
}
