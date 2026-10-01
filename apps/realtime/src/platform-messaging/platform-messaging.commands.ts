import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { signBusEvent, type EventEnvelope } from '@shared/eventbus';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { NatsLink } from '../nats-link.service';
import {
  READ_REQUESTED_SUBJECT,
  SEND_REQUESTED_SUBJECT,
  fail,
  type Ack,
  type ReadPayload,
  type SendPayload,
} from './protocol';

/** Publishes signed commands to the notification service. Never throws. */
@Injectable()
export class PlatformMessagingCommands {
  private readonly logger = new Logger(PlatformMessagingCommands.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(NatsLink) private readonly link: NatsLink,
  ) {}

  send(userId: string, payload: SendPayload): Promise<Ack<{ state: 'queued'; client_message_id: string }>> {
    return this.publish(SEND_REQUESTED_SUBJECT, payload.client_message_id, userId, { ...payload }, {
      state: 'queued' as const,
      client_message_id: payload.client_message_id,
    });
  }

  read(userId: string, payload: ReadPayload): Promise<Ack> {
    return this.publish(READ_REQUESTED_SUBJECT, randomUUID(), userId, { ...payload }, {});
  }

  private async publish<T extends object>(
    subject: string,
    id: string,
    userId: string,
    data: Record<string, unknown>,
    success: T,
  ): Promise<Ack<T>> {
    const secret = this.config.eventSigningSecret;
    if (!secret) {
      this.logger.error('event_signing_secret_unset');
      return fail('unavailable');
    }
    const envelope: EventEnvelope = {
      id,
      type: subject.split('.').slice(2).join('.'),
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: SYSTEM_TENANT_ID,
      actor: { user_id: userId },
      data,
    };
    try {
      await this.link.publish(subject, signBusEvent(secret, subject, envelope));
      return { ok: true, ...success };
    } catch (error) {
      this.logger.warn(`messaging_publish_failed:${subject}:${error instanceof Error ? error.message : 'unknown'}`);
      return fail('unavailable');
    }
  }
}
