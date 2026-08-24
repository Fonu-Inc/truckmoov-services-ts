import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SecretCipherService } from '@shared/crypto';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import type { MailAddress } from './mailbox.domain';
import { MAILBOX_READER, type MailboxReader } from './mailbox-reader.port';
import { MAILBOX_SENDER, type MailboxSender, type OutgoingAttachment } from './mailbox-sender.port';
import { MAILBOX_REPOSITORY, type MailboxRepository } from './mailbox.repository';

export class MailboxNotConnectedError extends Error {
  constructor() {
    super('No mailbox is connected for this organisation');
  }
}

export class ReplyTargetNotFoundError extends Error {
  constructor(threadId: string) {
    super(`No thread ${threadId} to reply to`);
  }
}

export type SendMailCommand = {
  tenantId: string;
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachments?: OutgoingAttachment[];
  /** Set to reply into an existing thread. */
  replyToThreadId?: string;
};

/**
 * Used only when the server declares no sent folder at all. Not a default:
 * the folder is discovered per mailbox, because Gmail names it
 * "[Gmail]/Sent Mail" and filing to "Sent" there creates a stray folder the
 * tenant's own client never looks at.
 */
const SENT_FOLDER_OF_LAST_RESORT = 'Sent';

@Injectable()
export class SendMailUseCase {
  constructor(
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(MAILBOX_SENDER) private readonly sender: MailboxSender,
    @Inject(MAILBOX_READER) private readonly reader: MailboxReader,
    @Inject(MAILBOX_REPOSITORY) private readonly repository: MailboxRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: SendMailCommand) {
    const stored = await this.credentials.findByTenant(command.tenantId);
    if (!stored) throw new MailboxNotConnectedError();

    const thread = await this.resolveReplyHeaders(command);

    const imapConnection = {
      host: stored.imap.host,
      port: stored.imap.port,
      username: stored.imap.username,
      password: this.cipher.decrypt(stored.imap.passwordCiphertext),
      secure: stored.imap.secure,
    };
    const folders = await this.reader.discoverFolders(imapConnection);

    // Generated here, before anything is composed, so the delivered message and
    // the copy filed to Sent carry the same identity — and so a later reply can
    // reference it.
    const messageId = `<${randomUUID()}@${stored.emailAddress.split('@')[1] ?? 'truckmoov'}>`;

    const outcome = await this.sender.send({
      smtp: {
        host: stored.smtp.host,
        port: stored.smtp.port,
        username: stored.smtp.username,
        password: this.cipher.decrypt(stored.smtp.passwordCiphertext),
        secure: stored.smtp.secure,
      },
      imap: imapConnection,
      sentFolder: folders.sent ?? SENT_FOLDER_OF_LAST_RESORT,
      from: { address: stored.emailAddress, name: stored.displayName },
      to: command.to,
      cc: command.cc ?? [],
      bcc: command.bcc ?? [],
      subject: thread.subject ?? command.subject,
      bodyText: command.bodyText ?? null,
      bodyHtml: command.bodyHtml ?? null,
      attachments: command.attachments ?? [],
      messageId,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
    });

    return {
      messageId: outcome.messageId,
      accepted: outcome.accepted,
      filedToSent: outcome.filedToSent,
      // Surfaced rather than swallowed: the message went, but the tenant's own
      // mail client will not show it in Sent until the filing is retried.
      filingError: outcome.filingError,
      threadId: thread.threadId,
    };
  }

  /**
   * Builds the headers that make a reply thread on the recipient's side.
   *
   * References carries the whole ancestry and In-Reply-To the immediate parent.
   * Sending a reply without them leaves the recipient's client showing it as a
   * new conversation, however correctly we thread it in our own store.
   */
  private async resolveReplyHeaders(command: SendMailCommand): Promise<{
    threadId: string | null;
    inReplyTo: string | null;
    references: string[];
    subject: string | null;
  }> {
    if (!command.replyToThreadId) {
      return { threadId: null, inReplyTo: null, references: [], subject: null };
    }

    const messages = await this.repository.listMessagesInThread(
      command.tenantId,
      command.replyToThreadId,
    );
    if (messages.length === 0) throw new ReplyTargetNotFoundError(command.replyToThreadId);

    const ordered = [...messages].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
    const parent = ordered[ordered.length - 1];

    return {
      threadId: command.replyToThreadId,
      inReplyTo: parent.messageId,
      // Ancestry plus the parent, deduplicated and in order. A client walks this
      // to place the reply, so dropping an entry can break the chain.
      references: [...new Set([...parent.references, parent.messageId])],
      subject: parent.subject.toLowerCase().startsWith('re:')
        ? parent.subject
        : `Re: ${parent.subject}`,
    };
  }
}
