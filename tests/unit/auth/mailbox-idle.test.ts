import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MailboxIdleSupervisor } from '../../../apps/auth/src/contexts/mailbox/mailbox-idle.supervisor';

function credentials(tenantIds: string[]) {
  return {
    listConnectedTenantIds: vi.fn(async () => tenantIds),
    findByTenant: vi.fn(async (tenantId: string) => ({
      tenantId,
      emailAddress: `ops@${tenantId}.com`,
      displayName: null,
      imap: { host: 'imap.x.com', port: 993, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
      smtp: { host: 'smtp.x.com', port: 587, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
      lastVerifiedAt: null,
      lastError: null,
      updatedAt: '2026-08-24T10:00:00.000Z',
    })),
    recordVerification: vi.fn(async () => {}),
  } as never;
}

function build(options: { tenants?: string[]; capacity?: number; enabled?: boolean } = {}) {
  const handlers: Record<string, { onNewMail: () => void; onDropped: (reason: string) => void }> = {};
  const stop = vi.fn(async () => {});
  const watch = vi.fn(async (request: never) => {
    const typed = request as unknown as {
      folder: string;
      onNewMail: () => void;
      onDropped: (reason: string) => void;
    };
    handlers[typed.folder + Object.keys(handlers).length] = typed;
    handlers.latest = typed;
    return stop;
  });
  const execute = vi.fn(async () => ({
    tenantId: 't', folder: 'INBOX', fetched: 1, threadsTouched: 1, lastUid: 1,
  }));

  const supervisor = new MailboxIdleSupervisor(
    {
      mailbox: {
        idleEnabled: options.enabled ?? true,
        maxIdleConnections: options.capacity ?? 200,
        syncEnabled: false,
        syncIntervalSeconds: 300,
      },
    } as never,
    credentials(options.tenants ?? ['tenant-a']),
    {
      discoverFolders: vi.fn(async () => ({
        all: ['INBOX'], inbox: 'INBOX', sent: null, trash: null, drafts: null, junk: null,
      })),
      fetchMessages: vi.fn(async () => []),
      fetchAttachment: vi.fn(async () => null),
    } as never,
    { watch } as never,
    { execute } as never,
    { decrypt: () => 'plain' } as never,
  );

  return { supervisor, watch, stop, execute, handlers };
}

describe('IMAP IDLE supervisor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing when idle is switched off', async () => {
    const { supervisor, watch } = build({ enabled: false });

    await supervisor.onApplicationBootstrap();

    expect(watch).not.toHaveBeenCalled();
  });

  it('watches each connected tenant', async () => {
    const { supervisor, watch } = build({ tenants: ['tenant-a', 'tenant-b'] });

    const result = await supervisor.startAll();

    expect(result).toMatchObject({ watching: 2, skipped: 0 });
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('watches the inbox only, leaving other folders to the poll', async () => {
    const { supervisor, watch } = build();

    await supervisor.startAll();

    expect((watch.mock.calls[0][0] as unknown as { folder: string }).folder).toBe('INBOX');
    expect(watch).toHaveBeenCalledTimes(1);
  });

  // A socket per mailbox held open for the life of the process.
  it('stops at the connection cap and says who fell back to polling', async () => {
    const { supervisor, watch } = build({ tenants: ['a', 'b', 'c', 'd'], capacity: 2 });

    const result = await supervisor.startAll();

    expect(result).toMatchObject({ watching: 2, skipped: 2 });
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('syncs when the server announces new mail', async () => {
    const { supervisor, execute, handlers } = build();
    await supervisor.startAll();

    handlers.latest.onNewMail();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst into one sync', async () => {
    const { supervisor, execute, handlers } = build();
    await supervisor.startAll();

    handlers.latest.onNewMail();
    handlers.latest.onNewMail();
    handlers.latest.onNewMail();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not sync before the burst has settled', async () => {
    const { supervisor, execute, handlers } = build();
    await supervisor.startAll();

    handlers.latest.onNewMail();
    await vi.advanceTimersByTimeAsync(500);

    expect(execute).not.toHaveBeenCalled();
  });

  it('reconnects after a drop', async () => {
    const { supervisor, watch, handlers } = build();
    await supervisor.startAll();

    handlers.latest.onDropped('connection closed');
    await vi.advanceTimersByTimeAsync(6_000);

    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('backs off further on a repeated drop, rather than looping', async () => {
    const { supervisor, watch, handlers } = build();
    await supervisor.startAll();

    handlers.latest.onDropped('closed');
    await vi.advanceTimersByTimeAsync(6_000);
    handlers.latest.onDropped('closed again');
    // The second wait is longer, so the first delay is not enough this time.
    await vi.advanceTimersByTimeAsync(6_000);

    expect(watch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(watch).toHaveBeenCalledTimes(3);
  });

  it('releases every connection on shutdown', async () => {
    const { supervisor, stop } = build({ tenants: ['tenant-a', 'tenant-b'] });
    await supervisor.startAll();

    await supervisor.onApplicationShutdown();

    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect once shutting down', async () => {
    const { supervisor, watch, handlers } = build();
    await supervisor.startAll();

    await supervisor.onApplicationShutdown();
    handlers.latest.onDropped('closed');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('keeps running when one tenant refuses a connection', async () => {
    const { supervisor } = build({ tenants: ['tenant-a', 'tenant-b'] });
    const failing = new MailboxIdleSupervisor(
      { mailbox: { idleEnabled: true, maxIdleConnections: 10, syncEnabled: false, syncIntervalSeconds: 300 } } as never,
      credentials(['tenant-a']),
      {
        discoverFolders: vi.fn(async () => {
          throw new Error('auth failed');
        }),
      } as never,
      { watch: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { decrypt: () => 'plain' } as never,
    );

    await expect(failing.startAll()).resolves.toMatchObject({ watching: 0 });
    await expect(supervisor.startAll()).resolves.toMatchObject({ watching: 2 });
  });
});
