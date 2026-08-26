import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { ApplyWaybillExtractionUseCase } from "./contexts/fleet/waybills/application/use-cases/apply-waybill-extraction.use-case";
import { WAYBILL_CAPTURED_SUBJECT } from "./contexts/fleet/waybills/infrastructure/eventbus-waybill-extraction.queue";

/**
 * Consumes captured waybills and runs extraction.
 *
 * Separate from the upload so a slow or failing extractor never holds up the
 * person taking the photo. The screen shows the waybill as pending and watches
 * it move.
 */
@Injectable()
export class WaybillExtractionListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(WaybillExtractionListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(ApplyWaybillExtractionUseCase)
    private readonly applyExtraction: ApplyWaybillExtractionUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(
      `tm.*.${WAYBILL_CAPTURED_SUBJECT}`,
      async (envelope) => {
        const waybillId = envelope.data["waybill_id"] as string;
        if (!waybillId) return;

        try {
          await this.applyExtraction.execute({
            waybillId,
            tenantId: envelope.tenant_id,
          });
        } catch (error) {
          // Swallowed so one unreadable waybill cannot stall the subject for
          // every other tenant. The stall sweep hands it to a person.
          this.logger.warn(
            `waybill_extraction_failed:${waybillId}:${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      },
      "waybill-extraction",
    );
  }
}
