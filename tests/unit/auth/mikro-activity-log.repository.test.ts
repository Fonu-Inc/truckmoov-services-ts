import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityLogEntry } from '../../../apps/auth/src/activity-log.types';

const em = {
  transactional: vi.fn(async (work: (tx: unknown) => Promise<void>) => work(tx)),
  find: vi.fn(async () => []),
  count: vi.fn(async () => 845),
};
const tx = {
  getConnection: () => ({ execute: async () => [] }),
  create: vi.fn((_entity: unknown, data: Record<string, unknown>) => data),
  persist: vi.fn(),
};

vi.mock('../../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm', () => ({
  ActivityLogRecord: class {},
  getAuthOrm: async () => ({ em: { fork: () => em } }),
}));

const { MikroActivityLogRepository } = await import(
  '../../../apps/auth/src/mikro-activity-log.repository'
);

function repository() {
  return new MikroActivityLogRepository({ db: {} } as never);
}

function entry(): ActivityLogEntry {
  return {
    id: 'log-1',
    tenantId: 'tenant-1',
    service: 'auth',
    action: 'user.logged_in',
    entityType: 'user',
    entityId: 'usr-1',
    summary: 'User signed in',
    actorId: 'usr-1',
    actorRole: 'OWNER_OPERATOR',
    actorName: 'Adaeze Okafor',
    actorEmail: 'adaeze.okafor@mtn.ng',
    tenantName: 'Lagos Express Logistics',
    metadata: {},
    occurredAt: '2026-09-07T14:54:11.000Z',
    recordedAt: '2026-09-07T14:54:11.000Z',
  };
}

describe('Postgres activity log repository', () => {
  beforeEach(() => {
    em.find.mockClear();
    em.count.mockClear();
    tx.create.mockClear();
  });

  // The columns existed but the insert left them out, so every row read null.
  it('persists the actor and tenant name snapshots', async () => {
    await repository().save(entry());

    expect(tx.create.mock.calls[0][1]).toMatchObject({
      actorName: 'Adaeze Okafor',
      actorEmail: 'adaeze.okafor@mtn.ng',
      tenantName: 'Lagos Express Logistics',
    });
  });

  // The cap belongs to the caller; the export asks for 5000.
  it('takes the cross-tenant limit as given', async () => {
    await repository().queryAcrossTenants({ limit: 5000 });
    expect(em.find.mock.calls[0][2]).toMatchObject({ limit: 5000 });
  });

  it('defaults the cross-tenant limit when none is given', async () => {
    await repository().queryAcrossTenants({});
    expect(em.find.mock.calls[0][2]).toMatchObject({ limit: 100 });
  });

  it('counts with the same filters the query applies', async () => {
    const filters = { tenantId: 'tenant-1', actor: 'Tunde', search: 'sim', limit: 10 };
    const repo = repository();

    await repo.queryAcrossTenants(filters);
    const total = await repo.countAcrossTenants(filters);

    expect(total).toBe(845);
    expect(em.count.mock.calls[0][1]).toEqual(em.find.mock.calls[0][1]);
    expect(em.count.mock.calls[0][1]).toMatchObject({ tenantId: 'tenant-1' });
    expect((em.count.mock.calls[0][1] as { $and: unknown[] }).$and).toHaveLength(2);
  });

  it('keeps the tenant-scoped read capped at 500', async () => {
    await repository().query('tenant-1', { limit: 5000 });
    expect(em.find.mock.calls[0][2]).toMatchObject({ limit: 500 });
  });
});
