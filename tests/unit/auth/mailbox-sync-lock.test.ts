import { describe, expect, it, vi } from 'vitest';

const lock = vi.hoisted(() => ({ free: true }));
vi.mock('@shared/db', () => ({
  runIfLockFree: vi.fn(async (_orm: unknown, _id: number, task: () => Promise<unknown>) =>
    lock.free ? { acquired: true, value: await task() } : { acquired: false },
  ),
}));
vi.mock('@auth/session/infrastructure/persistence/auth-orm', () => ({ getAuthOrm: vi.fn(async () => ({})) }));

import { MailboxSyncScheduler } from '../../../apps/auth/src/contexts/mailbox/mailbox-sync.scheduler';
import { MailboxIdleSupervisor } from '../../../apps/auth/src/contexts/mailbox/mailbox-idle.supervisor';

function scheduler() {
  const syncAllFolders = vi.fn(async () => ({ failed: [] }));
  const sut = new MailboxSyncScheduler(
    { persistence: { backend: 'mikro-orm' }, db: {} } as never,
    { listConnectedTenantIds: async () => ['tenant-a'] } as never,
    { syncAllFolders } as never,
  );
  return { sut, syncAllFolders };
}

describe('Mailbox sync across replicas', () => {
  it('syncs when this replica holds the lock', async () => {
    lock.free = true;
    const { sut, syncAllFolders } = scheduler();

    expect(await sut.run()).toEqual({ tenants: 1, failed: 0 });
    expect(syncAllFolders).toHaveBeenCalledOnce();
  });

  it('skips the tick when another replica holds the lock', async () => {
    lock.free = false;
    const { sut, syncAllFolders } = scheduler();

    expect(await sut.run()).toEqual({ tenants: 0, failed: 0 });
    expect(syncAllFolders).not.toHaveBeenCalled();
  });
});

describe('Mailbox IDLE start', () => {
  it('treats a credentials lookup failure as a failed start, not a crash', async () => {
    const supervisor = new MailboxIdleSupervisor(
      { mailbox: { idleEnabled: true, maxIdleConnections: 10 } } as never,
      {
        listConnectedTenantIds: async () => ['tenant-a'],
        findByTenant: async () => {
          throw new Error('db down');
        },
      } as never,
      {} as never,
      { watch: vi.fn() } as never,
      {} as never,
      { decrypt: () => 'plain' } as never,
    );

    await expect(supervisor.startAll()).resolves.toEqual({ watching: 0, skipped: 1 });
  });
});
