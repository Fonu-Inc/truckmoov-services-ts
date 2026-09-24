import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EVENT_BUS, type EventBus, type EventEnvelope } from '@shared/eventbus';
import {
  NotifyDeviceVerificationUseCase,
  type DeviceVerificationEvent,
  type DeviceVerificationOutcome,
} from '@auth/installation/application/use-cases/notify-device-verification.use-case';

export const DEVICE_VERIFICATION_SUBJECT = 'tm.*.device.verification.>';

const OUTCOMES: Record<string, DeviceVerificationOutcome> = {
  'device.verification.verified': 'verified',
  'device.verification.failed': 'failed',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function verificationEvent(envelope: EventEnvelope): DeviceVerificationEvent | null {
  const outcome = OUTCOMES[envelope.type];
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  const deviceId = text(data.device_id);
  if (!outcome || !deviceId || !envelope.id || !envelope.tenant_id) return null;
  return {
    eventId: envelope.id,
    tenantId: envelope.tenant_id,
    deviceId,
    outcome,
    device: { manufacturer: text(data.manufacturer), model: text(data.model), imei: text(data.imei) },
    reason: text(data.reason_message) || text(data.reason_code) || undefined,
  };
}

/** Fleet's verification results, as installer notifications. A failed handler is redelivered; the inbox dedupes on the event id. */
@Injectable()
export class DeviceVerificationListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceVerificationListener.name);
  private unsub?: () => Promise<void>;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(NotifyDeviceVerificationUseCase) private readonly notify: NotifyDeviceVerificationUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.unsub = await this.bus.subscribe(DEVICE_VERIFICATION_SUBJECT, (envelope) => this.handle(envelope), 'installer_notifications');
      this.logger.log('Device verification listener active');
    } catch (error) {
      this.logger.warn(`device_verification_subscribe_failed:${(error as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.unsub) await this.unsub();
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    const event = verificationEvent(envelope);
    if (!event) {
      this.logger.warn(`device_verification_event_invalid:${envelope.id ?? 'no-id'}`);
      return;
    }
    await this.notify.execute(event);
  }
}
