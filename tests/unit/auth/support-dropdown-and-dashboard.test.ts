import { describe, expect, it } from 'vitest';
import { GetSupportOptionsUseCase } from '../../../apps/auth/src/my-support.use-cases';
import { dashboardTicket } from '../../../apps/auth/src/get-system-support-dashboard.use-case';
import type { StoredSupportTicket } from '../../../apps/auth/src/support-ticket.repository';

const actor = { id: 'user-1', tenantId: 'tenant-1', role: 'ENTERPRISE_ADMIN' };

function optionsUseCase() {
  return new GetSupportOptionsUseCase(
    { resolveAccessToken: () => ({ userId: actor.id, sub: actor.id }) } as never,
    { findById: async () => actor } as never,
  );
}

describe('Support dropdown options', () => {
  // The wizard renders all four lists with one map. A bare string[] breaks it
  // on the last one.
  it('labels contextTypes like every other list', async () => {
    const { data } = await optionsUseCase().execute('token');

    for (const list of [data.categories, data.channels, data.priorities, data.contextTypes]) {
      expect(list.length).toBeGreaterThan(0);
      for (const option of list) {
        expect(typeof option.value).toBe('string');
        expect(typeof option.label).toBe('string');
        expect(option.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the stored context values unchanged', async () => {
    const { data } = await optionsUseCase().execute('token');
    expect(data.contextTypes.map((o) => o.value)).toContain('device');
    expect(data.contextTypes.find((o) => o.value === 'sim')?.label).toBe('SIM');
  });
});

describe('Dashboard ticket rows', () => {
  function ticket(overrides: Partial<StoredSupportTicket> = {}): StoredSupportTicket {
    return {
      id: 'tkt-1',
      tenantId: 'tenant-1',
      category: 'device_tracking',
      subject: 'GPS tracker offline',
      description: 'Stopped reporting',
      status: 'open',
      priority: 'low',
      channel: 'device',
      otherChannel: null,
      contextType: 'none',
      contextId: null,
      contextSnapshot: null,
      escalatedTo: null,
      escalatedReferenceId: null,
      escalationNotes: null,
      escalatedAt: null,
      escalatedBy: null,
      assignedTo: null,
      createdBy: 'user-1',
      resolvedAt: null,
      closedAt: null,
      createdAt: new Date('2026-09-10T09:00:00.000Z'),
      updatedAt: new Date('2026-09-10T10:00:00.000Z'),
      ...overrides,
    } as StoredSupportTicket;
  }

  // The cards sort Needs Attention by age and show a resolved-time chip, and
  // neither works from a row that carries no timestamps.
  it('carries the timestamps the cards render', () => {
    const row = dashboardTicket(ticket({ resolvedAt: new Date('2026-09-10T12:00:00.000Z') }));

    expect(row).toMatchObject({
      id: 'tkt-1',
      subject: 'GPS tracker offline',
      tenantId: 'tenant-1',
      category: 'device_tracking',
      status: 'open',
      priority: 'low',
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      resolvedAt: '2026-09-10T12:00:00.000Z',
    });
  });

  it('sends null rather than omitting a timestamp that has not happened', () => {
    const row = dashboardTicket(ticket());
    expect(row.resolvedAt).toBeNull();
    expect(row.closedAt).toBeNull();
    expect(row.escalatedAt).toBeNull();
  });
});
