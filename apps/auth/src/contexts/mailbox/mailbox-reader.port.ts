import type { MailMessage } from './mailbox.domain';

/** A message as the mail server holds it, before the platform assigns a thread. */
export type FetchedMessage = Omit<MailMessage, 'id' | 'tenantId' | 'threadId'> & {
  /** The server's sequence marker. Fetching resumes from the highest one seen. */
  uid: number;
};

export type MailboxConnection = {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
};

export type FetchRequest = {
  connection: MailboxConnection;
  folder: string;
  /** Fetch strictly after this uid. Zero means the whole folder. */
  sinceUid: number;
  limit: number;
};

/**
 * Reading a mailbox, expressed without naming a protocol.
 *
 * The application layer depends on this and never on an IMAP client, which is
 * what keeps the mail work movable: running it in another service, or swapping
 * IMAP for a provider API, replaces the adapter and nothing else.
 */
export interface MailboxReader {
  fetchMessages(request: FetchRequest): Promise<FetchedMessage[]>;
}

export const MAILBOX_READER = Symbol('MAILBOX_READER');
