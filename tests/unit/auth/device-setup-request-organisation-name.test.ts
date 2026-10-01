import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();

vi.mock('../../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm', () => ({
  getAuthOrm: async () => ({ em: { getConnection: () => ({ execute }) } }),
}));

import { MikroDeviceSetupRequestRepository } from '../../../apps/auth/src/mikro-device-setup-request.repository';

const TENANT_NAME_FALLBACK = /coalesce\(\s*nullif\(trim\(r\.organisation_name\), ''\),\s*\(select nullif\(trim\(o\.company->>'companyName'\), ''\)[\s\S]*?\(select nullif\(trim\(s\.branding->>'organizationName'\), ''\)/;

function row(organisationName: string | null) {
  return {
    id: 'req-1',
    tenant_id: 't1',
    organisation_name: organisationName,
    requesting_email: null,
    reference_number: 'DVR-401882',
    manufacturer: null,
    model: null,
    tracker_type: null,
    quantity: 1,
    sim_required: false,
    vehicle_id: null,
    state: null,
    city: null,
    preferred_date: null,
    use_case: 'Tracking',
    notes: null,
    status: 'under_review',
    assigned_to: null,
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    timeline: [],
    created_at: '2026-09-24T10:00:00Z',
    updated_at: '2026-09-24T10:00:00Z',
    kyc_status: null,
  };
}

function repository() {
  return new MikroDeviceSetupRequestRepository({ persistence: { backend: 'mikro-orm' }, db: {} } as never);
}

function respondWith(rows: unknown[]) {
  execute.mockImplementation(async (sql: string) => (sql.includes('information_schema') ? [{ exists: true }] : rows));
}

function dataQueries(): string[] {
  return execute.mock.calls.map(([sql]) => sql as string).filter((sql) => !sql.includes('information_schema'));
}

describe('device setup request organisation name', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('selects the tenant name when the request carries none', async () => {
    respondWith([row('Acme Haulage')]);

    const [request] = await repository().findAll();

    expect(request.organisationName).toBe('Acme Haulage');
    expect(dataQueries()[0]).toMatch(new RegExp(`${TENANT_NAME_FALLBACK.source}[\\s\\S]*as organisation_name`));
  });

  it('searches the resolved name, not only the stored column', async () => {
    respondWith([]);

    await repository().findAll({ search: 'acme' });

    expect(dataQueries()[0]).toMatch(new RegExp(`lower\\(coalesce\\(${TENANT_NAME_FALLBACK.source}[\\s\\S]*\\), ''\\)\\) like \\?`));
  });

  it('resolves the name on a single read too', async () => {
    respondWith([row(null)]);

    await repository().findById('req-1');

    expect(dataQueries()[0]).toMatch(TENANT_NAME_FALLBACK);
  });

  it('reads the reference and a request with no hardware chosen', async () => {
    respondWith([row(null)]);

    const [request] = await repository().findAll();

    expect(request).toMatchObject({ referenceNumber: 'DVR-401882', manufacturer: null, trackerType: null, status: 'under_review' });
    expect(dataQueries()[0]).toContain('r.reference_number');
  });

  it('searches by DVR reference and tolerates a missing manufacturer', async () => {
    respondWith([]);

    await repository().findAll({ search: 'DVR-4018' });

    const [sql] = dataQueries();
    expect(sql).toContain('lower(r.reference_number) like ?');
    expect(sql).toContain("lower(coalesce(r.manufacturer, '')) like ?");
    expect(execute.mock.calls.at(-1)?.[1]).toEqual(Array(6).fill('%dvr-4018%'));
  });

  it('counts the queue cards under the new statuses', async () => {
    execute.mockImplementation(async (sql: string) =>
      sql.includes('information_schema')
        ? [{ exists: true }]
        : [{ pending_approval: 2, awaiting_payment: 1, approved: 4, rejected: 1, devices_requested: 9 }],
    );

    const summary = await repository().summary();

    expect(summary).toEqual({ pendingApproval: 2, awaitingPayment: 1, approved: 4, rejected: 1, devicesRequested: 9 });
    expect(dataQueries()[0]).toContain("count(*) filter (where status = 'awaiting_payment')::int as awaiting_payment");
    expect(execute.mock.calls.at(-1)?.[1]).toEqual([
      'under_review',
      'awaiting_payment',
      'ready_for_installation',
      'installation_in_progress',
      'completed',
    ]);
  });

  it('starts installation and confirms payment with the new statuses', async () => {
    respondWith([]);
    const timeline = [{ status: 'ready_for_installation', at: 'now', note: null }];

    await repository().assign('req-1', 'admin-1', timeline);
    await repository().advance({ id: 'req-1', status: 'ready_for_installation', timeline });

    const [assign, advance] = dataQueries();
    expect(assign).toContain("status = 'installation_in_progress'");
    expect(advance).toContain('set status = ?, timeline = ?::jsonb');
    expect(execute.mock.calls.at(-1)?.[1]).toEqual(['ready_for_installation', JSON.stringify(timeline), 'req-1']);
  });
});
