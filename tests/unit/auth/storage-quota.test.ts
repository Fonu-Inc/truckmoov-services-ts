import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStorageUsageRepository } from '../../../apps/auth/src/in-memory-storage-usage.repository';
import { StorageQuotaService } from '../../../apps/auth/src/storage-quota.service';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import { EntitlementService } from '../../../apps/auth/src/entitlement.service';
import {
  BYTES_PER_GB,
  StorageQuotaExceededError,
} from '../../../apps/auth/src/storage-usage.repository';

// null means the plan sets no storage quota. A default parameter cannot express
// that: JS applies the default on an explicit undefined, so the case under test
// would silently get the 10 GB default instead.
async function build(storageGb: number | 'unlimited' | null = 10) {
  const usage = new InMemoryStorageUsageRepository();
  const planRepo = new InMemoryPlanEntitlementsRepository();

  await planRepo.save(
    {
      planCode: 'plan_starter',
      paymentModel: 'prepaid',
      inheritsFromCode: null,
      quotas: storageGb === null ? {} : { storage_gb: storageGb },
      limitBehaviour: {},
      features: [],
      allowances: [],
      availableFor: ['fleet_provider'],
      trialDays: 14,
    },
    null,
  );

  const service = new StorageQuotaService(
    usage,
    new EntitlementService(planRepo),
    { findByTenantId: async () => ({ subscription: { planCode: 'plan_starter' } }) } as never,
  );
  return { service, usage };
}

describe('storage is counted, not scanned', () => {
  it('sums every source into one total', async () => {
    const { service, usage } = await build();
    await usage.addBytes('tenant-a', 'fleet_documents', 1_000);
    await usage.addBytes('tenant-a', 'kyc', 2_000);
    await usage.addBytes('tenant-a', 'mailbox', 3_000);

    expect((await service.report('tenant-a')).usedBytes).toBe(6_000);
  });

  it('keeps each source separately, so one can be recomputed alone', async () => {
    const { service, usage } = await build();
    await usage.addBytes('tenant-a', 'fleet_documents', 5_000);
    await usage.addBytes('tenant-a', 'kyc', 1_000);

    await usage.setBytes('tenant-a', 'fleet_documents', 500);

    const report = await service.report('tenant-a');
    expect(report.usedBytes).toBe(1_500);
  });

  it('subtracts on delete', async () => {
    const { service, usage } = await build();
    await usage.addBytes('tenant-a', 'fleet_documents', 5_000);

    await usage.addBytes('tenant-a', 'fleet_documents', -2_000);

    expect((await service.report('tenant-a')).usedBytes).toBe(3_000);
  });

  // A double-counted delete must not hand a tenant free capacity.
  it('never goes negative', async () => {
    const { service, usage } = await build();
    await usage.addBytes('tenant-a', 'fleet_documents', 1_000);

    await usage.addBytes('tenant-a', 'fleet_documents', -5_000);

    expect((await service.report('tenant-a')).usedBytes).toBe(0);
  });

  it('keeps tenants apart', async () => {
    const { service, usage } = await build();
    await usage.addBytes('tenant-a', 'fleet_documents', 5_000);

    expect((await service.report('tenant-b')).usedBytes).toBe(0);
  });
});

describe('enforcement', () => {
  it('admits an upload that fits', async () => {
    const { service } = await build(10);

    await expect(service.assertRoomFor('tenant-a', 1_000)).resolves.toBeUndefined();
  });

  it('refuses an upload that would cross the limit', async () => {
    const { service, usage } = await build(1);
    await usage.addBytes('tenant-a', 'fleet_documents', BYTES_PER_GB - 100);

    await expect(service.assertRoomFor('tenant-a', 500)).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });

  it('measures the incoming file too, not just what is already stored', async () => {
    const { service } = await build(1);

    await expect(service.assertRoomFor('tenant-a', BYTES_PER_GB * 2)).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });

  it('enforces nothing on an unlimited plan', async () => {
    const { service, usage } = await build('unlimited');
    await usage.addBytes('tenant-a', 'fleet_documents', BYTES_PER_GB * 500);

    await expect(service.assertRoomFor('tenant-a', BYTES_PER_GB)).resolves.toBeUndefined();
  });

  it('enforces nothing when the plan sets no storage quota', async () => {
    const { service } = await build(null);

    await expect(service.assertRoomFor('tenant-a', BYTES_PER_GB * 99)).resolves.toBeUndefined();
  });

  it('reports no percentage when there is no limit to measure against', async () => {
    const { service } = await build('unlimited');

    expect((await service.report('tenant-a')).percentUsed).toBeNull();
  });

  it('says how much the plan allows and how much is used', async () => {
    const { service, usage } = await build(1);
    await usage.addBytes('tenant-a', 'fleet_documents', BYTES_PER_GB);

    await expect(service.assertRoomFor('tenant-a', 1)).rejects.toThrow(/includes 1 GB/);
  });
});
