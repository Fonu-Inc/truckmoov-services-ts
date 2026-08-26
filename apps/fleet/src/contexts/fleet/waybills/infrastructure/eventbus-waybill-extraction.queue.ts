import { Inject, Injectable } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import type {
  WaybillExtractionJob,
  WaybillExtractionQueue,
} from "../domain/ports/waybill-extraction.port";

export const WAYBILL_CAPTURED_SUBJECT = "waybill.captured";

/**
 * Queues extraction on JetStream, which already carries the platform's events
 * and gives the durability this needs: a captured waybill that nobody extracts
 * is an invoice that never gets raised.
 *
 * A second broker was considered and rejected — one workload does not justify
 * running Redis or RabbitMQ alongside NATS.
 */
@Injectable()
export class EventBusWaybillExtractionQueue implements WaybillExtractionQueue {
  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  async enqueue(job: WaybillExtractionJob): Promise<void> {
    await this.bus.publish(`tm.${job.tenantId}.${WAYBILL_CAPTURED_SUBJECT}`, {
      id: crypto.randomUUID(),
      type: WAYBILL_CAPTURED_SUBJECT,
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: job.tenantId,
      data: {
        waybill_id: job.waybillId,
        image_key: job.imageKey,
      },
    });
  }
}
