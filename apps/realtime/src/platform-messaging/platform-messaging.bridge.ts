import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { verifyBusEvent, type EventEnvelope } from '@shared/eventbus';
import { NatsLink } from '../nats-link.service';
import { PlatformMessagingGateway } from './platform-messaging.gateway';
import { EVENT_SUBJECTS } from './protocol';

/** Carries verified inbox events from the notification service to staff sockets. */
@Injectable()
export class PlatformMessagingBridge implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformMessagingBridge.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(NatsLink) private readonly link: NatsLink,
    @Inject(PlatformMessagingGateway) private readonly gateway: PlatformMessagingGateway,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.eventSigningSecret) this.logger.error('event_signing_secret_unset');
    try {
      for (const subject of Object.keys(EVENT_SUBJECTS)) {
        await this.link.subscribe(subject, (name, body) => this.forward(name, body));
      }
    } catch (error) {
      this.logger.error(`messaging_bridge_connect_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  forward(subject: string, body: unknown): void {
    const event = EVENT_SUBJECTS[subject];
    if (!event || typeof body !== 'object' || body === null) return;
    const envelope = body as EventEnvelope;
    const verdict = verifyBusEvent(this.config.eventSigningSecret, subject, envelope, {
      acceptUnsigned: this.config.eventAcceptUnsigned,
    });
    if (!verdict.ok) {
      this.logger.warn(`event_rejected:${subject}:${verdict.reason}`);
      return;
    }
    if (!verdict.signed) this.logger.warn(`event_unsigned_accepted:${subject}`);
    this.gateway.emitToStaff(event, envelope.data ?? {});
  }
}
