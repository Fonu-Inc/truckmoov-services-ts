import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  EVENT_BUS,
  signNotification,
  verifiedHandler,
  type EventBus,
  type EventEnvelope,
} from '@shared/eventbus';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

type ExpiringDocument = {
  document_type?: unknown;
  document_name?: unknown;
  expiry_date?: unknown;
  already_expired?: unknown;
};

/**
 * Turns one compliance digest per tenant into one email request per person.
 *
 * Fleet raises the digest because it owns compliance documents, but it does not
 * know who belongs to an account. This service does, so it resolves the
 * recipients and hands each one to the notification service over the same
 * `notification.send` subject every other outbound message uses.
 *
 * Recipients are every enabled user on the tenant rather than a named role,
 * because a tenant is not required to have any particular role filled.
 */
@Injectable()
export class ComplianceReminderListener
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ComplianceReminderListener.name);
  private readonly unsubs: Array<() => Promise<void>> = [];

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const unsub = await this.bus.subscribe(
        'tm.*.compliance.documents.expiring',
        verifiedHandler(
          async (event) => {
            await this.handle(event);
          },
          {
            secret: this.config.eventSigningSecret,
            acceptUnsigned: this.config.eventAcceptUnsigned,
            logger: this.logger,
          },
        ),
      );
      this.unsubs.push(unsub);
      this.logger.log('Compliance reminder listener active');
    } catch (error) {
      this.logger.warn(
        `compliance_reminder_subscribe_failed:${(error as Error).message}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.unsubs.map((unsub) => unsub()));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    const tenantId = event.tenant_id;
    const data = event.data as Record<string, unknown> | undefined;
    const documents = Array.isArray(data?.['documents'])
      ? (data!['documents'] as ExpiringDocument[])
      : [];

    if (!tenantId || documents.length === 0) return;

    const users = await this.userRepository.findAllByTenant(tenantId);
    const recipients = users.filter(
      (user) => (user.accountStatus ?? 'enabled') === 'enabled' && Boolean(user.email),
    );

    if (recipients.length === 0) {
      this.logger.warn(`compliance_reminder_no_recipients:tenant=${tenantId}`);
      return;
    }

    const content = this.composeDigest(documents);

    for (const recipient of recipients) {
      try {
        const secret = this.config.eventSigningSecret;
        if (!secret) throw new Error('EVENT_SIGNING_SECRET is not set');
        const envelope = {
          id: randomUUID(),
          type: 'notification.send',
          version: 1,
          occurred_at: new Date().toISOString(),
          tenant_id: tenantId,
          data: {
            channel: 'email',
            recipient: recipient.email,
            content,
          },
        };
        await this.bus.publish(`tm.${tenantId}.notification.send`, signNotification(secret, envelope));
      } catch (error) {
        this.logger.warn(
          `compliance_reminder_send_failed:tenant=${tenantId}:${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `compliance_reminder_dispatched:tenant=${tenantId}:recipients=${recipients.length}:documents=${documents.length}`,
    );
  }

  /**
   * The first line is the subject and the rest is the body: the notification
   * service splits on the blank line, which keeps the generic
   * `{channel, recipient, content}` contract usable for email.
   */
  private composeDigest(documents: ExpiringDocument[]): string {
    const expired = documents.filter((doc) => doc.already_expired === true);
    const subject =
      expired.length > 0
        ? `Action needed: ${expired.length} compliance document(s) have expired`
        : `${documents.length} compliance document(s) expiring soon`;

    const lines = documents.map((doc) => {
      const name = stringOr(doc.document_name, stringOr(doc.document_type, 'Document'));
      const expiry = stringOr(doc.expiry_date, 'unknown date');
      const state = doc.already_expired === true ? 'EXPIRED' : 'expires';
      return `- ${name}: ${state} ${expiry}`;
    });

    return [
      subject,
      '',
      'The following vehicle compliance documents need attention:',
      '',
      ...lines,
      '',
      'A vehicle with a lapsed document may not be legal to operate.',
    ].join('\n');
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}
