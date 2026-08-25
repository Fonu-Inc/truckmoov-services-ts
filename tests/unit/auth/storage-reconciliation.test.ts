import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStorageUsageRepository } from '../../../apps/auth/src/in-memory-storage-usage.repository';
import { StorageQuotaService } from '../../../apps/auth/src/storage-quota.service';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import { EntitlementService } from '../../../apps/auth/src/entitlement.service';

async function build() {
  const usage = new InMemoryStorageUsageRepository();
  const planRepo = new InMemoryPlanEntitlementsRepository();
  const service = new StorageQuotaService(
    usage,
    new EntitlementService(planRepo),
    { findByTenantId: async () => null } as never,
  );
  return { usage, service };
}

describe('reconciling a drifted subtotal', () => {
  let harness: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    harness = await build();
  });

  // A delete that never reported leaves the counter permanently high, and the
  // tenant is eventually refused with real room to spare.
  it('brings a total that drifted high back down', async () => {
    await harness.service.record('tenant-a', 'kyc', 10_000);

    await harness.service.reconcile('tenant-a', 'kyc', 4_000);

    expect((await harness.service.report('tenant-a')).usedBytes).toBe(4_000);
  });

  it('brings a total that drifted low back up', async () => {
    await harness.service.record('tenant-a', 'kyc', 1_000);

    await harness.service.reconcile('tenant-a', 'kyc', 9_000);

    expect((await harness.service.report('tenant-a')).usedBytes).toBe(9_000);
  });

  // Adding a delta can never fix drift, because the drift is exactly the
  // amount nobody knows about.
  it('replaces the subtotal rather than adding to it', async () => {
    await harness.service.record('tenant-a', 'kyc', 5_000);

    await harness.service.reconcile('tenant-a', 'kyc', 5_000);

    expect((await harness.service.report('tenant-a')).usedBytes).toBe(5_000);
  });

  it('corrects one source without disturbing the others', async () => {
    await harness.service.record('tenant-a', 'kyc', 1_000);
    await harness.service.record('tenant-a', 'mailbox', 2_000);
    await harness.service.record('tenant-a', 'fleet_documents', 3_000);

    await harness.service.reconcile('tenant-a', 'kyc', 500);

    const report = await harness.service.report('tenant-a');
    expect(report.usedBytes).toBe(5_500);
  });

  it('corrects one tenant without disturbing another', async () => {
    await harness.service.record('tenant-a', 'kyc', 1_000);
    await harness.service.record('tenant-b', 'kyc', 1_000);

    await harness.service.reconcile('tenant-a', 'kyc', 0);

    expect((await harness.service.report('tenant-b')).usedBytes).toBe(1_000);
  });

  it('can take a subtotal to zero when every file is gone', async () => {
    await harness.service.record('tenant-a', 'kyc', 8_000);

    await harness.service.reconcile('tenant-a', 'kyc', 0);

    expect((await harness.service.report('tenant-a')).usedBytes).toBe(0);
  });

  it('never stores a negative total', async () => {
    await harness.service.reconcile('tenant-a', 'kyc', -500);

    expect((await harness.service.report('tenant-a')).usedBytes).toBe(0);
  });
});
