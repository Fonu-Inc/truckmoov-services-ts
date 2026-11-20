import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryActivityLogRepository } from '../../../apps/auth/src/in-memory-activity-log.repository';
import { InMemoryAuditLogRepository } from '../../../apps/fleet/src/in-memory-audit-log.repository';
import type { ActivityLogEntry } from '../../../apps/auth/src/activity-log.types';

function activityEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 'entry-1',
    tenantId: 'tenant-a',
    service: 'auth',
    action: 'user.logged_in',
    entityType: 'user',
    entityId: 'user-1',
    summary: 'User signed in',
    actorId: 'user-1',
    actorRole: 'OWNER_OPERATOR',
    metadata: {},
    occurredAt: '2026-08-24T10:00:00.000Z',
    recordedAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

describe('auth activity log chain', () => {
  let repo: InMemoryActivityLogRepository;

  beforeEach(() => {
    repo = new InMemoryActivityLogRepository();
  });

  it('reports an empty chain as intact', async () => {
    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({
      intact: true,
      entriesChecked: 0,
    });
  });

  it('verifies a chain it wrote itself', async () => {
    await repo.save(activityEntry({ id: 'a' }));
    await repo.save(activityEntry({ id: 'b' }));
    await repo.save(activityEntry({ id: 'c' }));

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({
      intact: true,
      entriesChecked: 3,
      firstBreak: null,
    });
  });

  it('keeps each tenant on its own chain', async () => {
    await repo.save(activityEntry({ id: 'a', tenantId: 'tenant-a' }));
    await repo.save(activityEntry({ id: 'b', tenantId: 'tenant-b' }));
    await repo.save(activityEntry({ id: 'c', tenantId: 'tenant-a' }));

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({ intact: true, entriesChecked: 2 });
    await expect(repo.verifyChain('tenant-b')).resolves.toMatchObject({ intact: true, entriesChecked: 1 });
  });

  it("one tenant's entries do not appear in another's chain", async () => {
    await repo.save(activityEntry({ id: 'a', tenantId: 'tenant-a' }));

    await expect(repo.verifyChain('tenant-b')).resolves.toMatchObject({ entriesChecked: 0 });
  });

  it('detects an entry edited in place', async () => {
    await repo.save(activityEntry({ id: 'a' }));
    await repo.save(activityEntry({ id: 'b', action: 'user.deleted' }));
    await repo.save(activityEntry({ id: 'c' }));

    // Reach past the repository to simulate someone editing the row directly.
    const stored = (repo as unknown as { entries: Array<Record<string, unknown>> }).entries;
    stored[1].action = 'user.logged_out';

    const result = await repo.verifyChain('tenant-a');
    expect(result.intact).toBe(false);
    expect(result.firstBreak).toMatchObject({ id: 'b', reason: 'hash_mismatch' });
  });

  it('detects a removed entry', async () => {
    await repo.save(activityEntry({ id: 'a' }));
    await repo.save(activityEntry({ id: 'b' }));
    await repo.save(activityEntry({ id: 'c' }));

    const store = repo as unknown as { entries: Array<Record<string, unknown>> };
    store.entries.splice(1, 1);

    const result = await repo.verifyChain('tenant-a');
    expect(result.intact).toBe(false);
    expect(result.firstBreak).toMatchObject({ id: 'c', reason: 'broken_link' });
  });

  it('detects metadata edited without touching any other field', async () => {
    await repo.save(activityEntry({ id: 'a', metadata: { ip: '10.0.0.1' } }));
    await repo.save(activityEntry({ id: 'b' }));

    const store = repo as unknown as { entries: Array<Record<string, unknown>> };
    store.entries[0].metadata = { ip: '10.0.0.2' };

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({ intact: false });
  });

  it('is not fooled by re-hashing the edited row on its own', async () => {
    await repo.save(activityEntry({ id: 'a' }));
    await repo.save(activityEntry({ id: 'b' }));

    const store = repo as unknown as {
      entries: Array<Record<string, unknown>>;
    };
    const { hashAuditEntry } = await import('@shared/audit');
    const { toHashableActivityEntry } = await import('../../../apps/auth/src/activity-log.repository');
    store.entries[0].action = 'user.deleted';
    store.entries[0].rowHash = hashAuditEntry(
      toHashableActivityEntry(store.entries[0] as unknown as ActivityLogEntry),
      store.entries[0].prevHash as string,
    );

    // The row now self-verifies, but its successor still points at the old hash.
    const result = await repo.verifyChain('tenant-a');
    expect(result.intact).toBe(false);
    expect(result.firstBreak).toMatchObject({ id: 'b', reason: 'broken_link' });
  });
});

describe('fleet audit log chain', () => {
  let repo: InMemoryAuditLogRepository;

  beforeEach(() => {
    repo = new InMemoryAuditLogRepository();
  });

  const entry = (id: string, tenantId = 'tenant-a') => ({
    id,
    tenantId,
    entityType: 'vehicle' as const,
    entityId: 'vehicle-1',
    action: 'vehicle.created',
    actorId: 'user-1',
    metadata: {},
    occurredAt: '2026-08-24T10:00:00.000Z',
  });

  it('verifies a chain it wrote itself', async () => {
    await repo.append(entry('a'));
    await repo.append(entry('b'));

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({
      intact: true,
      entriesChecked: 2,
    });
  });

  it('keeps each tenant on its own chain', async () => {
    await repo.append(entry('a', 'tenant-a'));
    await repo.append(entry('b', 'tenant-b'));

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({ intact: true, entriesChecked: 1 });
    await expect(repo.verifyChain('tenant-b')).resolves.toMatchObject({ intact: true, entriesChecked: 1 });
  });

  it('detects an edited actor, which is what an attacker would change', async () => {
    await repo.append(entry('a'));
    await repo.append(entry('b'));

    const store = repo as unknown as { entries: Array<Record<string, unknown>> };
    store.entries[0].actorId = 'someone-else';

    const result = await repo.verifyChain('tenant-a');
    expect(result.intact).toBe(false);
    expect(result.firstBreak).toMatchObject({ id: 'a', reason: 'hash_mismatch' });
  });

  it('detects a removed entry', async () => {
    await repo.append(entry('a'));
    await repo.append(entry('b'));
    await repo.append(entry('c'));

    const store = repo as unknown as { entries: Array<Record<string, unknown>> };
    store.entries.splice(1, 1);

    await expect(repo.verifyChain('tenant-a')).resolves.toMatchObject({ intact: false });
  });
});
