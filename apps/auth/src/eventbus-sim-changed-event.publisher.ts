import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import type { SimChangedEvent, SimChangedEventPublisher } from './sim-changed-event.publisher';

@Injectable()
export class EventBusSimChangedEventPublisher implements SimChangedEventPublisher {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: EventBus) {}

  async publish(event: SimChangedEvent): Promise<void> {
    const subject = `tm.${event.tenant_id}.sim.changed`;
    await this.eventBus.publish(subject, {
      id: randomUUID(),
      type: 'sim.changed',
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: event.tenant_id,
      data: {
        sim_id: event.sim_id,
        iccid: event.iccid,
        msisdn: event.msisdn,
        carrier: event.carrier,
        plan: event.plan,
        status: event.status,
        device_id: event.device_id,
        device_imei: event.device_imei,
        vehicle_id: event.vehicle_id,
        data_usage_mb: event.data_usage_mb,
        data_limit_mb: event.data_limit_mb,
        expiry_date: event.expiry_date,
        action: event.action,
      },
    });
  }
}
