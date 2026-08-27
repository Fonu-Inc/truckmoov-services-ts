import type { MailboxConnection } from './mailbox-reader.port';

export type FlagChanges = {
  starred?: boolean;
  addLabels?: string[];
  removeLabels?: string[];
};

/**
 * Writing state back to the mailbox the platform mirrors.
 *
 * Kept apart from MailboxReader and MailboxSender: this is neither a bulk
 * read nor originating a new message, it is a single-message mutation. A
 * star or label set locally and never written back would leave the tenant's
 * real mail client showing something different from what this platform
 * shows — the two must not diverge.
 */
export interface MailboxFlagsWriter {
  setFlags(connection: MailboxConnection, folder: string, uid: number, changes: FlagChanges): Promise<void>;
}

export const MAILBOX_FLAGS_WRITER = Symbol('MAILBOX_FLAGS_WRITER');
