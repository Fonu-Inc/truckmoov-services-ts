import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { isPubliclyRoutableHost } from '@shared/http';
import { UnsafeMailboxHostError } from './imap-mailbox.reader';
import type { MailboxWatcher, StopWatching, WatchRequest } from './mailbox-watcher.port';

/**
 * IMAP IDLE. The server holds the connection open and announces new mail
 * instead of being asked for it on a timer.
 */
@Injectable()
export class ImapMailboxWatcher implements MailboxWatcher {
  private readonly logger = new Logger(ImapMailboxWatcher.name);

  async watch(request: WatchRequest): Promise<StopWatching> {
    if (!isPubliclyRoutableHost(request.connection.host)) {
      throw new UnsafeMailboxHostError(request.connection.host);
    }

    const client = new ImapFlow({
      host: request.connection.host,
      port: request.connection.port,
      secure: request.connection.secure,
      auth: { user: request.connection.username, pass: request.connection.password },
      logger: false,
      // Without this the client stays silent on a half-open socket and the
      // watch appears healthy while receiving nothing.
      socketTimeout: 10 * 60 * 1000,
    });

    let stopped = false;

    client.on('error', (error: Error) => {
      if (stopped) return;
      request.onDropped(error.message);
    });
    client.on('close', () => {
      if (stopped) return;
      request.onDropped('connection closed');
    });
    // Fired when the mailbox gains messages while the connection is held open.
    client.on('exists', () => {
      if (!stopped) request.onNewMail();
    });

    await client.connect();
    await client.mailboxOpen(request.folder);

    return async () => {
      stopped = true;
      client.removeAllListeners();
      await client.logout().catch(() => {
        // Shutting down anyway; a failed logout changes nothing.
      });
    };
  }
}
