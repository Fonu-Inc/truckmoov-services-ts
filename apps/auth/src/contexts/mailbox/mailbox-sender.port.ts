import type { MailAddress } from './mailbox.domain';
import type { MailboxConnection } from './mailbox-reader.port';

export type OutgoingAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type SendRequest = {
  smtp: MailboxConnection;
  imap: MailboxConnection;
  /** Where the composed copy is filed. Discovered per mailbox, not assumed. */
  sentFolder: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: OutgoingAttachment[];
  /** Ours, generated before sending so both copies carry the same one. */
  messageId: string;
  /** Set when replying, so the recipient's client threads it correctly. */
  inReplyTo: string | null;
  references: string[];
};

export type SendOutcome = {
  messageId: string;
  /** The relay accepted it. Not a delivery receipt: SMTP does not give one. */
  accepted: boolean;
  /** The composed copy was filed in the tenant's Sent folder. */
  filedToSent: boolean;
  /** Present when the send succeeded but filing did not. */
  filingError: string | null;
};

/**
 * Sending on the tenant's behalf.
 *
 * Sending and filing to Sent are one operation, not two. SMTP alone puts
 * nothing in a Sent folder — that is a client behaviour — so a message sent
 * without the IMAP append never appears in the tenant's own mail client at all.
 * Asking "is it in Sent yet" would be waiting for something nobody writes.
 */
export interface MailboxSender {
  send(request: SendRequest): Promise<SendOutcome>;
}

export const MAILBOX_SENDER = Symbol('MAILBOX_SENDER');
