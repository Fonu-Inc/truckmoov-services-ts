import { describe, expect, it, vi } from 'vitest';
import { GetTenantResourceUseCase } from '../../../apps/auth/src/system-tenant-detail.use-cases';
import { SystemTenantNotFoundError } from '../../../apps/auth/src/get-system-tenant.use-case';

const ACTOR = { id: 'admin-1', tenantId: 'system', role: 'SUPER_ADMIN' };

function useCase(options: {
  tenants?: Array<{ id: string; planCode: string | null; quotas?: Record<string, number | null> }>;
  fleet?: { total: number; items: unknown[] } | null;
  quotas?: Record<string, unknown>;
}) {
  const tenantResource = vi.fn().mockResolvedValue(options.fleet ?? null);
  const findByPlanCode = vi.fn(async () => ({ quotas: options.quotas ?? {} }));

  const instance = new GetTenantResourceUseCase(
    { resolveAccessToken: () => ({ userId: ACTOR.id, sub: ACTOR.id }) } as never,
    { findById: async () => ACTOR } as never,
    { tenantResource } as never,
    { findAll: async () => ({ items: [], total: 0 }) } as never,
    { findByPlanCode } as never,
    { list: async () => (options.tenants ?? []).map((row) => ({ quotas: {}, ...row })) } as never,
  );
  return { instance, tenantResource, findByPlanCode };
}

describe('Tenant resource tab', () => {
  // A typo'd id used to answer exactly like a real tenant whose fleet service
  // was down, so the drawer could not tell the two apart.
  it('404s on a tenant that does not exist', async () => {
    const { instance, tenantResource } = useCase({ tenants: [] });

    await expect(instance.execute('token', 'no-such-tenant', 'vehicles', null)).rejects.toBeInstanceOf(
      SystemTenantNotFoundError,
    );
    // And does not go asking the fleet service about it.
    expect(tenantResource).not.toHaveBeenCalled();
  });

  it('still reports available:false when the tenant is real but fleet is down', async () => {
    const { instance } = useCase({
      tenants: [{ id: 'tenant-1', planCode: null }],
      fleet: null,
    });

    const result = await instance.execute('token', 'tenant-1', 'vehicles', null);
    expect(result.data).toMatchObject({ available: false, total: 0, items: [] });
  });

  // The caller should not have to know the tenant's plan to get its limit.
  it('takes the plan from the tenant when no planCode is passed', async () => {
    const { instance, findByPlanCode } = useCase({
      tenants: [{ id: 'tenant-1', planCode: 'starter', quotas: { vehicles: 10 } }],
      fleet: { total: 3, items: [] },
    });

    const result = await instance.execute('token', 'tenant-1', 'vehicles', null);
    expect(findByPlanCode).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ available: true, total: 3, used: 3, limit: 10 });
  });

  it('lets an explicit planCode override the tenant plan', async () => {
    const { instance, findByPlanCode } = useCase({
      tenants: [{ id: 'tenant-1', planCode: 'starter' }],
      fleet: { total: 1, items: [] },
      quotas: { vehicles: 50 },
    });

    await instance.execute('token', 'tenant-1', 'vehicles', 'enterprise');
    expect(findByPlanCode).toHaveBeenCalledWith('enterprise');
  });
});
