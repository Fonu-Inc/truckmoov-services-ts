import { Inject, Injectable } from '@nestjs/common';
import { SecretCipherService } from '@shared/crypto';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from '../auth/session';
import { resolveActorUser } from '../auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from '../auth/session/domain/ports/token-service.port';
import type { UserRepository } from '../auth/session/domain/ports/user-repository.port';
import { MAILBOX_FLAGS_WRITER, type FlagChanges, type MailboxFlagsWriter } from './mailbox-flags-writer.port';
import { MAILBOX_REPOSITORY, type MailboxRepository } from './mailbox.repository';
import { MailboxNotConnectedError } from './send-mail.use-case';

export class MessageNotFoundError extends Error {
  constructor(id: string) {
    super(`No message ${id}`);
  }
}

export { MailboxNotConnectedError };

export type UpdateMessageFlagsCommand = {
  messageId: string;
  starred?: boolean;
  addLabels?: string[];
  removeLabels?: string[];
};

/**
 * Stars or labels a message. Writes to the real mailbox first — that is the
 * source of truth this platform mirrors — and only then updates the local
 * copy, so a failed IMAP write never leaves the two disagreeing about what a
 * message is flagged as.
 */
@Injectable()
export class UpdateMessageFlagsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(MAILBOX_FLAGS_WRITER) private readonly writer: MailboxFlagsWriter,
    @Inject(MAILBOX_REPOSITORY) private readonly repository: MailboxRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async execute(accessToken: string, command: UpdateMessageFlagsCommand) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    const tenantId = actor.tenantId!;

    const message = await this.repository.findById(tenantId, command.messageId);
    if (!message) throw new MessageNotFoundError(command.messageId);

    const stored = await this.credentials.findByTenant(tenantId);
    if (!stored) throw new MailboxNotConnectedError();

    const changes: FlagChanges = {
      starred: command.starred,
      addLabels: command.addLabels,
      removeLabels: command.removeLabels,
    };

    await this.writer.setFlags(
      {
        host: stored.imap.host,
        port: stored.imap.port,
        username: stored.imap.username,
        password: this.cipher.decrypt(stored.imap.passwordCiphertext),
        secure: stored.imap.secure,
      },
      message.folder,
      message.uid,
      changes,
    );

    const nextLabels = mergeLabels(message.labels, command.addLabels, command.removeLabels);
    await this.repository.updateFlags(tenantId, command.messageId, {
      starred: command.starred ?? message.starred,
      labels: nextLabels,
    });

    return {
      status: true,
      message: 'success',
      data: { id: message.id, starred: command.starred ?? message.starred, labels: nextLabels },
    };
  }
}

function mergeLabels(current: string[], add?: string[], remove?: string[]): string[] {
  const removed = new Set(remove ?? []);
  const kept = current.filter((label) => !removed.has(label));
  const added = (add ?? []).filter((label) => !kept.includes(label));
  return [...kept, ...added];
}
