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

/**
 * What is known about whether a sent message arrived.
 *
 * SMTP returns no delivery receipt, so "delivered" is never asserted: a message
 * is accepted by the relay and then either bounces or is heard of no more.
 */
export type DeliveryStatus = 'unknown' | 'bounced';

export type MailMessage = {
  id: string;
  tenantId: string;
  threadId: string;
  /** The server's sequence marker, kept so attachment bytes can be fetched later. */
  uid: number;
  deliveryStatus: DeliveryStatus;
  /** The reason a message bounced, passed through from the report verbatim. */
  deliveryDetail: string | null;
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
  /** Read from IMAP's \Flagged flag on every sync, same as `seen` reads \Seen. */
  starred: boolean;
  /**
   * IMAP keyword flags other than the standard system ones (\Seen, \Flagged,
   * \Answered, \Deleted, \Draft, \Recent). Modelled as generic keywords rather
   * than a Gmail-specific label extension, so it works against any IMAP
   * server that advertises PERMANENTFLAGS \*, not only Gmail.
   */
  labels: string[];
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

const BOUNCE_SENDERS = ['mailer-daemon', 'postmaster'];
const BOUNCE_REPORT_HINTS = [
  'delivery status notification',
  'undelivered mail returned to sender',
  'returned mail',
  'delivery has failed',
  'mail delivery failed',
];

export type BounceReport = {
  /** The Message-ID of the message that failed. */
  originalMessageId: string;
  reason: string;
};

/**
 * Reads a delivery failure out of an inbound message.
 *
 * A bounce is an ordinary email: the mail system reports the failure by sending
 * one, quoting the original message inside it. There is no callback and no
 * status API, so this is the only way a send is ever known to have failed.
 *
 * Returns null for anything that is not a report, including a human simply
 * replying with the word "failed".
 */
export function readBounceReport(message: MailMessage): BounceReport | null {
  if (!looksLikeDeliveryReport(message)) return null;

  const body = `${message.bodyText ?? ''}\n${message.bodyHtml ?? ''}`;
  const originalMessageId = quotedMessageId(body) ?? message.references[0] ?? message.inReplyTo;
  if (!originalMessageId) return null;

  return { originalMessageId, reason: failureReason(body) };
}

function looksLikeDeliveryReport(message: MailMessage): boolean {
  const sender = message.from.address.toLowerCase();
  if (BOUNCE_SENDERS.some((known) => sender.startsWith(known))) return true;

  const subject = message.subject.toLowerCase();
  return BOUNCE_REPORT_HINTS.some((hint) => subject.includes(hint));
}

/**
 * A report quotes the failed message's headers, so its Message-ID appears in
 * the body. Matched on the header line rather than on any angle-bracketed text,
 * which would also catch the recipient address.
 */
function quotedMessageId(body: string): string | null {
  const match = body.match(/^\s*Message-I[Dd]:\s*(<[^>\s]+>)/m);
  return match?.[1] ?? null;
}

/**
 * The provider's own words, not ours. A rewritten reason loses the detail that
 * tells the sender whether the address was wrong or the mailbox was full.
 */
function failureReason(body: string): string {
  const diagnostic = body.match(/^\s*Diagnostic-Code:\s*(.+)$/m)?.[1];
  if (diagnostic) return diagnostic.trim();

  const status = body.match(/^\s*Status:\s*(\d\.\d\.\d)/m)?.[1];
  return status ? `Delivery failed with status ${status}` : 'Delivery failed';
}
