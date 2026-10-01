import { describe, expect, it, vi } from 'vitest';

const { getAuthOrm } = vi.hoisted(() => ({ getAuthOrm: vi.fn() }));
vi.mock('../../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm', () => ({
  BundleAllocationRecord: class {},
  getAuthOrm,
}));

import { MikroBundleAllocationRepository } from '../../../apps/auth/src/mikro-bundle-allocation.repository';

describe('MikroBundleAllocationRepository.findById', () => {
  it('answers null for a non-uuid id without querying the uuid column', async () => {
    const repo = new MikroBundleAllocationRepository({ db: {} } as never);

    expect(await repo.findById('not-a-uuid')).toBeNull();
    expect(getAuthOrm).not.toHaveBeenCalled();
  });
});
