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
    manufacturer: 'Teltonika',
    model: null,
    tracker_type: 'hardwired',
    quantity: 1,
    sim_required: false,
    vehicle_id: null,
    state: null,
    city: null,
    preferred_date: null,
    use_case: 'Tracking',
    notes: null,
    status: 'pending_review',
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
});
