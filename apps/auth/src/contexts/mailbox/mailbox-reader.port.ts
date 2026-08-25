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

/** The folders a mailbox exposes, mapped to the roles the platform cares about. */
export type MailboxFolders = {
  /** Every folder path, as the server names them. */
  all: string[];
  inbox: string;
  /** Null when the server declares no folder for the role. */
  sent: string | null;
  trash: string | null;
  drafts: string | null;
  junk: string | null;
};

/**
 * Reading a mailbox, expressed without naming a protocol.
 *
 * The application layer depends on this and never on an IMAP client, which is
 * what keeps the mail work movable: running it in another service, or swapping
 * IMAP for a provider API, replaces the adapter and nothing else.
 */
export interface MailboxReader {
  /**
   * Folder names are never assumed. Gmail calls its sent folder
   * "[Gmail]/Sent Mail", so a hardcoded "Sent" silently fails there. The
   * server declares each folder's role through SPECIAL-USE.
   */
  discoverFolders(connection: MailboxConnection): Promise<MailboxFolders>;
  fetchMessages(request: FetchRequest): Promise<FetchedMessage[]>;
  /**
   * The bytes of one attachment, fetched when something asks for them.
   *
   * Identified by position within the message rather than by a MIME part path:
   * the whole message is re-read and re-parsed, which costs a download but
   * cannot mis-address a part.
   */
  fetchAttachment(request: AttachmentRequest): Promise<AttachmentBytes | null>;
}

export type AttachmentRequest = {
  connection: MailboxConnection;
  folder: string;
  uid: number;
  index: number;
};

export type AttachmentBytes = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export const MAILBOX_READER = Symbol('MAILBOX_READER');
