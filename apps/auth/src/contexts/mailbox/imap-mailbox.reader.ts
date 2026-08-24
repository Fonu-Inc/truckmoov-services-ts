import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { isPubliclyRoutableHost } from '@shared/http';
import type { MailAddress, MailAttachment } from './mailbox.domain';
import type { FetchRequest, FetchedMessage, MailboxReader } from './mailbox-reader.port';

export class UnsafeMailboxHostError extends Error {
  constructor(host: string) {
    super(`${host} is not a reachable public mail host`);
  }
}

@Injectable()
export class ImapMailboxReader implements MailboxReader {
  private readonly logger = new Logger(ImapMailboxReader.name);

  async fetchMessages(request: FetchRequest): Promise<FetchedMessage[]> {
    // Re-checked at connect time, not only when the credential was saved. DNS
    // can be repointed at a private address between the two, which is the whole
    // shape of a rebinding attack.
    if (!isPubliclyRoutableHost(request.connection.host)) {
      throw new UnsafeMailboxHostError(request.connection.host);
    }

    const client = new ImapFlow({
      host: request.connection.host,
      port: request.connection.port,
      secure: request.connection.secure,
      auth: { user: request.connection.username, pass: request.connection.password },
      logger: false,
    });

    await client.connect();
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
  return (parsed.attachments ?? []).map((attachment, index) => ({
    id: attachment.cid ?? `${parsed.messageId ?? 'msg'}-${index}`,
    filename: attachment.filename ?? `attachment-${index + 1}`,
    contentType: attachment.contentType ?? 'application/octet-stream',
    sizeBytes: attachment.size ?? 0,
    storageKey: null,
  }));
}
