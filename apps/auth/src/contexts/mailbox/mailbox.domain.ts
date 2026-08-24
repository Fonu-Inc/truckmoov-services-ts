/**
 * The tenant's mailbox, as this platform models it.
 *
 * We aggregate a mailbox the tenant already owns rather than hosting one, so
 * nothing here originates mail: every message is something their IMAP server
 * already holds, reduced to what the platform needs to display and thread it.
 */

export type MailAddress = {
  address: string;
  name: string | null;
};

export type MailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Where the bytes live in object storage. Null until the body is fetched. */
  storageKey: string | null;
};

export type MailMessage = {
  id: string;
  tenantId: string;
  threadId: string;
  /** The provider's own identifier, unique within a mailbox. */
  messageId: string;
  inReplyTo: string | null;
  /** Ordered oldest first, as the References header carries it. */
  references: string[];
  folder: string;
  subject: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: MailAttachment[];
  sentAt: string;
  receivedAt: string;
  seen: boolean;
};

export type MailThread = {
  id: string;
  tenantId: string;
  subject: string;
  participants: MailAddress[];
  messageCount: number;
  lastMessageAt: string;
  hasUnread: boolean;
};

/**
 * The thread a message belongs to.
 *
 * Threading follows the mail headers rather than the subject line: References
 * holds the whole ancestry, In-Reply-To the immediate parent. Subject matching
 * is the fallback only, because "Re: invoice" from two unrelated senders is one
 * thread by subject and two conversations in truth.
 */
export function resolveThreadId(
  message: Pick<MailMessage, 'messageId' | 'inReplyTo' | 'references'>,
  knownThreadByMessageId: ReadonlyMap<string, string>,
): string {
  // The root of the References chain is the oldest ancestor, so a thread stays
  // one thread however deeply it is nested.
  for (const reference of message.references) {
    const thread = knownThreadByMessageId.get(reference);
    if (thread) return thread;
  }

  if (message.inReplyTo) {
    const thread = knownThreadByMessageId.get(message.inReplyTo);
    if (thread) return thread;
  }

  // Nothing known to attach to: this message starts its own thread.
  return message.references[0] ?? message.messageId;
}

/** Everyone who appeared on a message, deduplicated by address. */
export function participantsOf(messages: readonly MailMessage[]): MailAddress[] {
  const byAddress = new Map<string, MailAddress>();

  for (const message of messages) {
    for (const participant of [message.from, ...message.to, ...message.cc]) {
      const key = participant.address.toLowerCase();
      // A name is not always present on every appearance; keep the first one
      // that has one so a thread does not show bare addresses unnecessarily.
      const existing = byAddress.get(key);
      if (!existing || (!existing.name && participant.name)) {
        byAddress.set(key, { address: key, name: participant.name });
      }
    }
  }

  return [...byAddress.values()];
}

/**
 * Bcc is deliberately excluded from thread participants. A blind copy is not
 * visible to the other recipients, and surfacing it in a shared thread view
 * would disclose it to people the sender chose to hide it from.
 */
export function summariseThread(
  threadId: string,
  tenantId: string,
  messages: readonly MailMessage[],
): MailThread {
  const ordered = [...messages].sort((left, right) => left.sentAt.localeCompare(right.sentAt));

  return {
    id: threadId,
    tenantId,
    subject: ordered[0]?.subject ?? '(no subject)',
    participants: participantsOf(ordered),
    messageCount: ordered.length,
    lastMessageAt: ordered[ordered.length - 1]?.sentAt ?? new Date(0).toISOString(),
    hasUnread: ordered.some((message) => !message.seen),
  };
}
