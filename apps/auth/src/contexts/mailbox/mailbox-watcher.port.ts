import type { MailboxConnection } from './mailbox-reader.port';

export type WatchRequest = {
  connection: MailboxConnection;
  folder: string;
  /** Called when the server reports new mail. Must not throw. */
  onNewMail: () => void;
  /** Called when the connection drops, so the supervisor can decide to retry. */
  onDropped: (reason: string) => void;
};

/** Stops the watch and releases the connection. Safe to call twice. */
export type StopWatching = () => Promise<void>;

/**
 * A held-open connection that reports new mail as it arrives.
 *
 * Polling asks "anything new?" on a timer; this is the server telling us. The
 * difference is minutes of latency, which matters for an inbox someone is
 * watching and does not for a folder nobody reads live.
 *
 * A watch costs one connection per mailbox held open indefinitely, so it is
 * spent where the latency is worth it rather than on every folder.
 */
export interface MailboxWatcher {
  watch(request: WatchRequest): Promise<StopWatching>;
}

export const MAILBOX_WATCHER = Symbol('MAILBOX_WATCHER');
