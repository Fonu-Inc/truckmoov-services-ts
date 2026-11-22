import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryBundleCatalogRepository } from '../../../apps/auth/src/in-memory-bundle-catalog.repository';
import { ListSystemBundleCatalogUseCase } from '../../../apps/auth/src/list-system-bundle-catalog.use-case';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import type { StoredBundleCatalog } from '../../../apps/auth/src/bundle-catalog.repository';

const TOKEN = 'sys-token';

function tokenService() {
  return {
    resolveAccessToken: () => ({ id: 'sys1' }) as never,
  };
}

function userRepo(role = 'SYSTEM_ADMIN', tenantId = 'system') {
  return {
    findById: async () => ({
      id: 'sys1',
      email: 'admin@system',
      passwordHash: 'x',
      role,
      tenantId,
      accountStatus: 'enabled',
    }),
  };
}

function buildBundle(overrides: Partial<StoredBundleCatalog> = {}): StoredBundleCatalog {
  const now = new Date();
  return {
    id: 'b-1',
    code: 'MTN_1GB_M',
    name: 'MTN 1GB Monthly',
    carrierId: 'MTN',
    dataAmountGb: 1,
    validityDays: 30,
    billingCycle: 'monthly',
    priceKobo: 150_000,
    currency: 'NGN',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ListSystemBundleCatalogUseCase', () => {
  let repo: InMemoryBundleCatalogRepository;

  beforeEach(async () => {
    repo = new InMemoryBundleCatalogRepository();
    await repo.save(buildBundle());
    await repo.save(
      buildBundle({ id: 'b-2', code: 'GLO_5GB_M', name: 'Glo 5GB Monthly', carrierId: 'GLO', active: false }),
    );
  });

  function build(role?: string, tenantId?: string) {
    return new ListSystemBundleCatalogUseCase(
      tokenService() as never,
      userRepo(role, tenantId) as never,
      repo,
      { findAll: async () => [{ id: 'MTN', displayName: 'MTN Nigeria' }] } as never,
    );
  }

  it('returns active and inactive bundles when no status filter is given', async () => {
    const result = await build().execute(TOKEN);

    expect(result.data.total).toBe(2);
    expect(result.data.items.map((b) => b.id).sort()).toEqual(['b-1', 'b-2']);
  });

  it('returns only active bundles when active is true', async () => {
    const result = await build().execute(TOKEN, { active: true });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.id).toBe('b-1');
  });

  it('returns only inactive bundles when active is false', async () => {
    const result = await build().execute(TOKEN, { active: false });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.id).toBe('b-2');
  });

  it('names the carrier for display, and null for one it does not know', async () => {
    const result = await build().execute(TOKEN);
    const byId = Object.fromEntries(result.data.items.map((b) => [b.id, b.carrierName]));
    expect(byId).toEqual({ 'b-1': 'MTN Nigeria', 'b-2': null });
  });

  it('exports every bundle the filters match as a csv', async () => {
    const file = await build().export(TOKEN, { active: true });
    const lines = file.buffer.toString('utf8').trim().split('\n');
    expect(file.contentType).toContain('csv');
    expect(lines[0]).toContain('Code');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('MTN Nigeria');
  });

  it('converts the stored kobo price to naira', async () => {
    const result = await build().execute(TOKEN, { active: true });

    expect(result.data.items[0]?.price).toBe(1500);
  });

  it('refuses an actor outside the system tenant', async () => {
    await expect(build('ADMIN', 'tenant-a').execute(TOKEN)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a system-tenant actor without a system role', async () => {
    await expect(build('DISPATCHER', 'system').execute(TOKEN)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
