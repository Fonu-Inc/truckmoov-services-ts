import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import {
  MtnBundleSyncBusyError,
  SyncMtnBundleCatalogUseCase,
} from '../../../apps/auth/src/sync-mtn-bundle-catalog.use-case';

function harness(tenantId = 'system', role = 'SYSTEM_ADMIN') {
  const tokens = {
    resolveAccessToken: vi.fn(() => ({ id: 'admin-1' })),
  };
  const users = {
    findById: vi.fn(async () => ({
      id: 'admin-1',
      email: 'admin@truckmoov.com',
      role,
      tenantId,
      accountStatus: 'enabled',
    })),
  };
  const sync = {
    syncExclusively: vi.fn(async () => ({
      fetched: 2,
      created: 1,
      updated: 1,
      deactivated: 0,
      skipped: 0,
    })),
  };
  return {
    sut: new SyncMtnBundleCatalogUseCase(tokens as never, users as never, sync as never),
    sync,
  };
}

describe('sync MTN bundle catalogue use case', () => {
  it('runs for a system admin and returns the summary', async () => {
    const { sut, sync } = harness();

    await expect(sut.execute('Bearer token')).resolves.toEqual({
      status: true,
      message: 'success',
      data: {
        fetched: 2,
        created: 1,
        updated: 1,
        deactivated: 0,
        skipped: 0,
      },
    });
    expect(sync.syncExclusively).toHaveBeenCalledTimes(1);
  });

  it('reports a conflict when another sync is already running', async () => {
    const { sut, sync } = harness();
    sync.syncExclusively.mockResolvedValueOnce(null);

    await expect(sut.execute('Bearer token')).rejects.toBeInstanceOf(
      MtnBundleSyncBusyError,
    );
  });

  it('refuses a system role held outside the system tenant', async () => {
    const { sut, sync } = harness('tenant-a');

    await expect(sut.execute('Bearer token')).rejects.toBeInstanceOf(ForbiddenError);
    expect(sync.syncExclusively).not.toHaveBeenCalled();
  });
});
