import { describe, expect, it, vi } from 'vitest';
import { GetAuditFilterOptionsUseCase } from '../../../apps/auth/src/audit-log.use-cases';

type TenantOption = { tenantId: string; tenantName: string | null };

function labelWith(names: Record<string, string | null> = {}) {
  const organizationNameFor = vi.fn(async (id: string) => names[id] ?? null);
  const useCase = new GetAuditFilterOptionsUseCase(
    {} as never,
    {} as never,
    {} as never,
    { organizationNameFor } as never,
  );
  const label = (tenants: TenantOption[]) =>
    (
      useCase as unknown as { labelTenants(t: TenantOption[]): Promise<TenantOption[]> }
    ).labelTenants(tenants);

  return { label, organizationNameFor };
}

describe('Audit filter tenant labels', () => {
  // tenant_name is stamped on rows only since the column was added, so every
  // tenant whose rows predate it has nothing to show but a UUID.
  it('looks up a name the audit rows never captured', async () => {
    const { label, organizationNameFor } = labelWith({ 'tenant-1': 'Lagos Haulage' });

    await expect(label([{ tenantId: 'tenant-1', tenantName: null }])).resolves.toEqual([
      { tenantId: 'tenant-1', tenantName: 'Lagos Haulage' },
    ]);
    expect(organizationNameFor).toHaveBeenCalledWith('tenant-1');
  });

  it('prefers the name the row already carries', async () => {
    const { label, organizationNameFor } = labelWith();

    await expect(label([{ tenantId: 'tenant-1', tenantName: 'Snapshot Name' }])).resolves.toEqual([
      { tenantId: 'tenant-1', tenantName: 'Snapshot Name' },
    ]);
    expect(organizationNameFor).not.toHaveBeenCalled();
  });

  it('still returns null when nothing knows the name', async () => {
    const { label } = labelWith();
    await expect(label([{ tenantId: 'gone', tenantName: null }])).resolves.toEqual([
      { tenantId: 'gone', tenantName: null },
    ]);
  });

  // "system" is the platform's own id, not a customer.
  it('labels the platform tenant', async () => {
    const { label, organizationNameFor } = labelWith();

    await expect(label([{ tenantId: 'system', tenantName: null }])).resolves.toEqual([
      { tenantId: 'system', tenantName: 'System / Platform' },
    ]);
    expect(organizationNameFor).not.toHaveBeenCalled();
  });
});
