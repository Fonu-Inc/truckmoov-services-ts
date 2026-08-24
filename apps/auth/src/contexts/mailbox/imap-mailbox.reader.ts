import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { isPubliclyRoutableHost } from '@shared/http';
import type { MailAddress, MailAttachment } from './mailbox.domain';
import type {
  FetchRequest,
  FetchedMessage,
  MailboxConnection,
  MailboxFolders,
  MailboxReader,
} from './mailbox-reader.port';

export class UnsafeMailboxHostError extends Error {
  constructor(host: string) {
    super(`${host} is not a reachable public mail host`);
  }
}

@Injectable()
export class ImapMailboxReader implements MailboxReader {
  private readonly logger = new Logger(ImapMailboxReader.name);

  async discoverFolders(connection: MailboxConnection): Promise<MailboxFolders> {
    const client = await this.connect(connection);
    try {
      const listed = await client.list();
      const byRole = (role: string) =>
        listed.find((folder) => folder.specialUse === role)?.path ?? null;

      return {
        all: listed.map((folder) => folder.path),
        // INBOX is the one name IMAP does fix, so it needs no discovery.
        inbox: listed.find((folder) => folder.path.toUpperCase() === 'INBOX')?.path ?? 'INBOX',
        sent: byRole('\\Sent') ?? fallbackByName(listed, ['sent']),
        trash: byRole('\\Trash') ?? fallbackByName(listed, ['trash', 'deleted']),
        drafts: byRole('\\Drafts') ?? fallbackByName(listed, ['draft']),
        junk: byRole('\\Junk') ?? fallbackByName(listed, ['junk', 'spam']),
      };
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async fetchMessages(request: FetchRequest): Promise<FetchedMessage[]> {
    const client = await this.connect(request.connection);
    try {
      const lock = await client.getMailboxLock(request.folder);
      try {
        return await this.readFolder(client, request);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {
        // The messages are already read; a failed logout must not lose them.
      });
    }
  }

  private async connect(connection: MailboxConnection): Promise<ImapFlow> {
    // Re-checked at connect time, not only when the credential was saved. DNS
    // can be repointed at a private address between the two, which is the whole
    // shape of a rebinding attack.
    if (!isPubliclyRoutableHost(connection.host)) {
      throw new UnsafeMailboxHostError(connection.host);
    }

    const client = new ImapFlow({
      host: connection.host,
      port: connection.port,
      secure: connection.secure,
      auth: { user: connection.username, pass: connection.password },
      logger: false,
    });
    await client.connect();
    return client;
  }

  private async readFolder(client: ImapFlow, request: FetchRequest): Promise<FetchedMessage[]> {
    const messages: FetchedMessage[] = [];
    const range = `${request.sinceUid + 1}:*`;

    for await (const item of client.fetch(range, { uid: true, source: true, flags: true }, { uid: true })) {
      if (messages.length >= request.limit) break;
      if (!item.source) continue;

      try {
        const parsed = await simpleParser(item.source);
        messages.push(toFetchedMessage(parsed, item.uid, request.folder, item.flags));
      } catch (error) {
        // One unparseable message must not abort the whole sync, or a single
        // malformed mail blocks the mailbox from ever advancing past it.
        this.logger.warn(
          `mail_parse_failed:uid=${item.uid}:${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return messages;
  }
}

function toFetchedMessage(
  parsed: ParsedMail,
  uid: number,
  folder: string,
  flags: Set<string> | undefined,
): FetchedMessage {
  const sentAt = parsed.date?.toISOString() ?? new Date().toISOString();

  return {
    // Falls back to the uid so a message with no Message-ID header still gets a
    // stable identity within this mailbox rather than colliding with others.
    messageId: parsed.messageId ?? `uid-${uid}@local`,
    inReplyTo: parsed.inReplyTo ?? null,
    references: normaliseReferences(parsed.references),
    folder,
    subject: parsed.subject ?? '(no subject)',
    from: toAddresses(parsed.from)[0] ?? { address: 'unknown', name: null },
    to: toAddresses(parsed.to),
    cc: toAddresses(parsed.cc),
    bcc: toAddresses(parsed.bcc),
    bodyText: parsed.text ?? null,
    bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
    attachments: toAttachments(parsed),
    sentAt,
    receivedAt: new Date().toISOString(),
    seen: flags?.has('\\Seen') ?? false,
    uid,
  };
}

function normaliseReferences(references: ParsedMail['references']): string[] {
  if (!references) return [];
  return Array.isArray(references) ? references : [references];
}

function toAddresses(field: AddressObject | AddressObject[] | undefined): MailAddress[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];

  return objects.flatMap((object) =>
    (object.value ?? [])
      .filter((entry) => Boolean(entry.address))
      .map((entry) => ({ address: entry.address!.toLowerCase(), name: entry.name || null })),
  );
}

/**
 * Attachment metadata only. The bytes are left on the server until something
 * asks for them: pulling every attachment on every sync would move a large
 * amount of data for mail nobody opens.
 */
function toAttachments(parsed: ParsedMail): MailAttachment[] {
  // Indexed by position within the message, not by cid: cid is the Content-ID
  // of an inline image, absent on an ordinary attachment and not unique across
  // messages, so it cannot identify an attachment for retrieval.
  return (parsed.attachments ?? []).map((attachment, index) => ({
    id: `${parsed.messageId ?? `uid-unknown`}#${index}`,
    filename: attachment.filename ?? `attachment-${index + 1}`,
    contentType: attachment.contentType ?? 'application/octet-stream',
    sizeBytes: attachment.size ?? 0,
    storageKey: null,
  }));
}

/**
 * Used when a server declares no SPECIAL-USE for a role, which older servers do
 * not. Name matching is the fallback only: it is a guess, and a wrong guess
 * files sent mail into the wrong folder.
 */
function fallbackByName(
  listed: readonly { path: string }[],
  needles: readonly string[],
): string | null {
  const match = listed.find((folder) =>
    needles.some((needle) => folder.path.toLowerCase().includes(needle)),
  );
  return match?.path ?? null;
}
