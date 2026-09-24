import { describe, expect, it } from 'vitest';
import { clientIpFrom } from '@shared/http';
import { InMemoryActivityLogRepository } from '../../../apps/auth/src/in-memory-activity-log.repository';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogUseCase,
  VerifyAuditChainsUseCase,
} from '../../../apps/auth/src/audit-log.use-cases';
import type { ActivityLogEntry } from '../../../apps/auth/src/activity-log.types';

const TOKEN = 'system-token';

function actor() {
  return { resolveAccessToken: () => ({ id: 'sys1' }) as never };
}

function users() {
  return {
    findById: async () => ({
      id: 'sys1',
      email: 'admin@system',
      passwordHash: 'x',
      role: 'SYSTEM_ADMIN',
      tenantId: 'system',
      accountStatus: 'enabled',
    }),
  };
}

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 'log-1',
    tenantId: 'tenant-1',
    service: 'auth',
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: 'tenant-3',
    summary: 'Tenant created',
    actorId: 'usr-1',
    actorRole: 'SYSTEM_ADMIN',
    actorName: 'Adaeze Okafor',
    actorEmail: 'adaeze.okafor@mtn.ng',
    tenantName: 'Lagos Express Logistics',
    metadata: { ipAddress: '102.89.34.18' },
    occurredAt: '2026-09-07T14:54:11.000Z',
    recordedAt: '2026-09-07T14:54:11.000Z',
    ...overrides,
  };
}

async function seed() {
  const repository = new InMemoryActivityLogRepository();
  await repository.save(entry());
  await repository.save(
    entry({
      id: 'log-2',
      tenantId: 'tenant-2',
      service: 'fleet',
      action: 'tenant.suspended',
      entityType: 'user',
      entityId: 'user-3e9',
      actorName: 'Tunde Bakare',
      actorEmail: 'tunde.bakare@fleetpro.ng',
      tenantName: 'Accra Swift Delivery',
      metadata: { ipAddress: '197.210.65.221' },
      occurredAt: '2026-09-07T14:17:11.000Z',
    }),
  );
  await repository.save(
    entry({
      id: 'log-3',
      tenantId: 'tenant-1',
      service: 'auth',
      action: 'user.invited',
      entityType: 'sim',
      entityId: 'sim-3ea',
      actorName: 'Chika Eze',
      actorEmail: 'chika.eze@lagosexpress.ng',
      metadata: {},
      occurredAt: '2026-09-07T13:40:11.000Z',
    }),
  );
  return repository;
}

async function seedMany(count: number) {
  const repository = new InMemoryActivityLogRepository();
  for (let index = 0; index < count; index++) {
    await repository.save(
      entry({
        id: `log-${index}`,
        occurredAt: new Date(Date.UTC(2026, 8, 7) + index * 1000).toISOString(),
      }),
    );
  }
  return repository;
}

function lister(repository: InMemoryActivityLogRepository) {
  return new ListAuditLogUseCase(actor() as never, users() as never, repository);
}

describe('Cross-tenant audit log', () => {
  it('returns rows from every tenant, newest first', async () => {
    const result = await lister(await seed()).execute(TOKEN, {});

    expect(result.data.total).toBe(3);
    expect(result.data.items.map((row) => row.id)).toEqual(['log-1', 'log-2', 'log-3']);
    expect(new Set(result.data.items.map((row) => row.tenantId)).size).toBe(2);
  });

  it('maps the row onto the columns the screen shows', async () => {
    const result = await lister(await seed()).execute(TOKEN, { limit: 1 });

    expect(result.data.items[0]).toMatchObject({
      occurredAt: '2026-09-07T14:54:11.000Z',
      actorName: 'Adaeze Okafor',
      actorEmail: 'adaeze.okafor@mtn.ng',
      action: 'tenant.created',
      resourceType: 'tenant',
      resourceId: 'tenant-3',
      tenantName: 'Lagos Express Logistics',
      ipAddress: '102.89.34.18',
      source: 'auth',
    });
  });

  // Source is which service recorded the entry, which the row already carried.
  it('reads Source from the recording service', async () => {
    const result = await lister(await seed()).execute(TOKEN, {});
    expect(result.data.items.map((row) => row.source)).toEqual(['auth', 'fleet', 'auth']);
  });

  // Rows written before capture existed carry no address, and say so.
  it('reports a missing address as null rather than guessing', async () => {
    const result = await lister(await seed()).execute(TOKEN, { action: 'user.invited' });
    expect(result.data.items[0].ipAddress).toBeNull();
  });

  it('filters by tenant, action and resource type', async () => {
    const repository = await seed();
    const list = lister(repository);

    expect((await list.execute(TOKEN, { tenantId: 'tenant-2' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { action: 'tenant.created' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { entityType: 'sim' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { service: 'fleet' })).data.total).toBe(1);
  });

  it('filters by date range', async () => {
    const list = lister(await seed());
    const result = await list.execute(TOKEN, {
      from: new Date('2026-09-07T14:00:00.000Z'),
      to: new Date('2026-09-07T14:30:00.000Z'),
    });

    expect(result.data.items.map((row) => row.id)).toEqual(['log-2']);
  });

  // One box for id, name or email: whoever is chasing a person has whichever
  // of the three they happen to hold.
  it('matches an actor by id, name or email', async () => {
    const list = lister(await seed());

    for (const term of ['usr-1', 'Tunde', 'chika.eze@lagosexpress.ng']) {
      expect((await list.execute(TOKEN, { actor: term })).data.total).toBeGreaterThan(0);
    }
    expect((await list.execute(TOKEN, { actor: 'Tunde' })).data.items[0].id).toBe('log-2');
  });

  // The page is a slice; total is how many rows the filters match, so the
  // screen can say "showing 1 of 3".
  it('reports the full filtered count, not the page size', async () => {
    const list = lister(await seed());

    const page = await list.execute(TOKEN, { limit: 1 });
    expect(page.data.items).toHaveLength(1);
    expect(page.data.total).toBe(3);

    const filtered = await list.execute(TOKEN, { tenantId: 'tenant-1', limit: 1 });
    expect(filtered.data.total).toBe(2);
  });

  it('caps the list at 500 rows while counting them all', async () => {
    const result = await lister(await seedMany(845)).execute(TOKEN, { limit: 5000 });

    expect(result.data.items).toHaveLength(500);
    expect(result.data.total).toBe(845);
  });

  // The export shares the list's filters but not its cap.
  it('exports past the list cap, up to 5000 rows', async () => {
    const list = lister(await seedMany(845));

    expect(await list.rows(TOKEN, { limit: 5000 })).toHaveLength(845);
    expect(await list.rows(TOKEN, { limit: 600 })).toHaveLength(600);
    expect(await list.rows(TOKEN, { limit: 9000 })).toHaveLength(845);
  });

  it('searches across every displayed field', async () => {
    const list = lister(await seed());

    expect((await list.execute(TOKEN, { search: 'Accra' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { search: 'sim-3ea' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { search: 'suspended' })).data.total).toBe(1);
    expect((await list.execute(TOKEN, { search: 'nothing-here' })).data.total).toBe(0);
  });
});

describe('Audit filter options', () => {
  it('offers only values the trail actually contains', async () => {
    const result = await new GetAuditFilterOptionsUseCase(
      actor() as never,
      users() as never,
      await seed(),
    ).execute(TOKEN);

    expect(result.data.tenants).toEqual([
      { tenantId: 'tenant-1', tenantName: 'Lagos Express Logistics' },
      { tenantId: 'tenant-2', tenantName: 'Accra Swift Delivery' },
    ]);
    expect(result.data.actions).toEqual(['tenant.created', 'tenant.suspended', 'user.invited']);
    expect(result.data.resourceTypes).toEqual(['sim', 'tenant', 'user']);
    expect(result.data.services).toEqual(['auth', 'fleet']);
  });
});

describe('Chain verification', () => {
  it('reports every tenant chain intact when nothing has been tampered with', async () => {
    const result = await new VerifyAuditChainsUseCase(
      actor() as never,
      users() as never,
      await seed(),
    ).execute(TOKEN);

    expect(result.data.intact).toBe(true);
    expect(result.data.chainsChecked).toBe(2);
    expect(result.data.entriesChecked).toBe(3);
    expect(result.data.brokenChains).toEqual([]);
  });
});

describe('Establishing the caller address', () => {
  const options = { trustedProxies: ['10.0.0.1'], header: 'x-forwarded-for' };

  it('uses the socket address on a direct connection', () => {
    const ip = clientIpFrom(
      { headers: {}, socket: { remoteAddress: '102.89.34.18' } },
      options,
    );
    expect(ip).toBe('102.89.34.18');
  });

  // The header is client-controlled. Believing it from an untrusted peer lets
  // any caller write whatever address they like into the audit trail.
  it('ignores a forwarding header from an untrusted peer', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '203.0.113.9' },
      },
      options,
    );
    expect(ip).toBe('203.0.113.9');
  });

  it('believes the header when the peer is a trusted proxy', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '102.89.34.18, 10.0.0.1' },
        socket: { remoteAddress: '10.0.0.1' },
      },
      options,
    );
    expect(ip).toBe('102.89.34.18');
  });

  it('falls back to the proxy address when it forwards nothing', () => {
    const ip = clientIpFrom({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }, options);
    expect(ip).toBe('10.0.0.1');
  });

  // Node reports IPv4 sockets as IPv6-mapped, which would never match a
  // configured proxy address written the ordinary way.
  it('matches a trusted proxy through the IPv6 mapping', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '102.89.34.18' },
        socket: { remoteAddress: '::ffff:10.0.0.1' },
      },
      options,
    );
    expect(ip).toBe('102.89.34.18');
  });

  it('returns null when there is no socket to read', () => {
    expect(clientIpFrom({ headers: {}, socket: null }, options)).toBeNull();
  });

  // Gateway pods change address on every reschedule, so a proxy can be a range.
  it('believes the header when the peer is inside a trusted CIDR range', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '102.89.34.18' },
        socket: { remoteAddress: '::ffff:10.42.0.199' },
      },
      { trustedProxies: ['10.42.0.0/16'], header: 'x-forwarded-for' },
    );
    expect(ip).toBe('102.89.34.18');
  });

  it('ignores the header when the peer is outside the trusted range', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '10.43.0.5' },
      },
      { trustedProxies: ['10.42.0.0/16'], header: 'x-forwarded-for' },
    );
    expect(ip).toBe('10.43.0.5');
  });

  it('matches an IPv6 range and skips a malformed one', () => {
    const request = {
      headers: { 'x-forwarded-for': '102.89.34.18' },
      socket: { remoteAddress: 'fd00::7' },
    };

    expect(
      clientIpFrom(request, { trustedProxies: ['fd00::/8'], header: 'x-forwarded-for' }),
    ).toBe('102.89.34.18');
    expect(
      clientIpFrom(request, {
        trustedProxies: ['fd00::/abc', '10.0.0.0/99'],
        header: 'x-forwarded-for',
      }),
    ).toBe('fd00::7');
  });

  it('trusts nothing when no proxies are configured', () => {
    const ip = clientIpFrom(
      {
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '10.0.0.1' },
      },
      { trustedProxies: [], header: 'x-forwarded-for' },
    );
    expect(ip).toBe('10.0.0.1');
  });
});
