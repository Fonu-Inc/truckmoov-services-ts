import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  UNLIMITED,
  fitsWithinQuota,
  resolveEffectiveEntitlements,
  type PlanEntitlements,
} from '../../../apps/auth/src/plan-entitlements';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import {
  EntitlementService,
  PlanNotEntitledError,
  QuotaExceededError,
} from '../../../apps/auth/src/entitlement.service';

function plan(overrides: Partial<PlanEntitlements> = {}): PlanEntitlements {
  return {
    planCode: 'starter',
    paymentModel: 'prepaid',
    inheritsFromCode: null,
    quotas: { vehicles: 10, drivers: 10 },
    limitBehaviour: { vehicles: 'block', drivers: 'block' },
    features: [{ key: 'gps_tracking', label: 'Real-time GPS tracking', enabled: true, limit: null }],
    allowances: [{ item: 'messages', includedPerMonth: 1_000 }],
    availableFor: ['fleet_provider'],
    trialDays: 14,
    ...overrides,
  };
}

describe('unlimited is a state, not a large number', () => {
  it('admits any count', () => {
    expect(fitsWithinQuota(UNLIMITED, 1)).toBe(true);
    expect(fitsWithinQuota(UNLIMITED, 999_999_999)).toBe(true);
  });

  it('refuses the unit past a real limit', () => {
    expect(fitsWithinQuota(10, 9)).toBe(true);
    expect(fitsWithinQuota(10, 10)).toBe(false);
  });

  it('treats zero as a real limit that refuses everything', () => {
    expect(fitsWithinQuota(0, 0)).toBe(false);
  });

  it('treats an absent quota as no limit, which is not zero', () => {
    expect(fitsWithinQuota(undefined, 500)).toBe(true);
  });
});

describe('plans inherit', () => {
  it('takes what the parent had and lets the child override it', () => {
    const parent = plan({ planCode: 'starter', quotas: { vehicles: 10, drivers: 5 } });
    const child = plan({
      planCode: 'professional',
      inheritsFromCode: 'starter',
      quotas: { vehicles: 50 },
    });

    const effective = resolveEffectiveEntitlements(child, [parent]);

    expect(effective.quotas.vehicles).toBe(50);
    expect(effective.quotas.drivers).toBe(5);
  });

  it('merges features by key rather than duplicating them', () => {
    const parent = plan({
      features: [{ key: 'gps_tracking', label: 'GPS', enabled: true, limit: null }],
    });
    const child = plan({
      planCode: 'professional',
      inheritsFromCode: 'starter',
      features: [{ key: 'sso', label: 'SSO', enabled: true, limit: null }],
    });

    const effective = resolveEffectiveEntitlements(child, [parent]);

    expect(effective.features.map((f) => f.key).sort()).toEqual(['gps_tracking', 'sso']);
  });

  it('lets a child raise a limit the parent set on a feature', () => {
    const parent = plan({
      features: [{ key: 'geofencing', label: 'Geofencing', enabled: true, limit: 5 }],
    });
    const child = plan({
      planCode: 'professional',
      inheritsFromCode: 'starter',
      features: [{ key: 'geofencing', label: 'Geofencing', enabled: true, limit: 50 }],
    });

    const effective = resolveEffectiveEntitlements(child, [parent]);

    expect(effective.features.find((f) => f.key === 'geofencing')?.limit).toBe(50);
  });
});

describe('EntitlementService', () => {
  let repository: InMemoryPlanEntitlementsRepository;
  let service: EntitlementService;

  beforeEach(async () => {
    repository = new InMemoryPlanEntitlementsRepository();
    service = new EntitlementService(repository);
    await repository.save(plan({ planCode: 'starter' }), null);
    await repository.save(
      plan({
        planCode: 'professional',
        inheritsFromCode: 'starter',
        quotas: { vehicles: 50 },
        allowances: [{ item: 'messages', includedPerMonth: 5_000 }],
      }),
      null,
    );
  });

  it('resolves the whole chain server-side', async () => {
    const effective = await service.effectiveFor('professional');

    expect(effective.quotas.vehicles).toBe(50);
    expect(effective.quotas.drivers).toBe(10);
  });

  it('refuses a plan with no entitlements rather than assuming any', async () => {
    await expect(service.effectiveFor('nonexistent')).rejects.toBeInstanceOf(PlanNotEntitledError);
  });

  it('refuses the unit past the quota', async () => {
    await expect(service.assertQuota('starter', 'vehicles', 9)).resolves.toBeUndefined();
    await expect(service.assertQuota('starter', 'vehicles', 10)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('does not refuse when the plan bills the overage instead of blocking', async () => {
    await repository.save(
      plan({ planCode: 'flex', quotas: { vehicles: 1 }, limitBehaviour: { vehicles: 'allow_and_bill' } }),
      null,
    );

    await expect(service.assertQuota('flex', 'vehicles', 99)).resolves.toBeUndefined();
  });

  it('checks features by key, not by label', async () => {
    await expect(service.hasFeature('starter', 'gps_tracking')).resolves.toBe(true);
    await expect(service.hasFeature('starter', 'Real-time GPS tracking')).resolves.toBe(false);
  });

  // A cycle would otherwise depend on where the walk happened to stop.
  it('survives a plan chain that loops', async () => {
    await repository.save(plan({ planCode: 'a', inheritsFromCode: 'b' }), null);
    await repository.save(plan({ planCode: 'b', inheritsFromCode: 'a' }), null);

    await expect(service.effectiveFor('a')).resolves.toBeTruthy();
  });
});

describe('monthly allowance is consumed once', () => {
  let repository: InMemoryPlanEntitlementsRepository;

  beforeEach(() => {
    repository = new InMemoryPlanEntitlementsRepository();
  });

  it('covers usage inside the allowance', async () => {
    const result = await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 400, 1_000);

    expect(result).toEqual({ covered: 400, uncovered: 0 });
  });

  it('splits usage that crosses the allowance', async () => {
    await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 900, 1_000);

    const result = await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 300, 1_000);

    expect(result).toEqual({ covered: 100, uncovered: 200 });
  });

  it('covers nothing once the allowance is spent', async () => {
    await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 1_000, 1_000);

    const result = await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 50, 1_000);

    expect(result).toEqual({ covered: 0, uncovered: 50 });
  });

  it('starts fresh in a new month without anything resetting it', async () => {
    await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 1_000, 1_000);

    const result = await repository.consumeAllowance('tenant-a', 'messages', '2026-09', 400, 1_000);

    expect(result.covered).toBe(400);
  });

  it('keeps tenants separate', async () => {
    await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 1_000, 1_000);

    const result = await repository.consumeAllowance('tenant-b', 'messages', '2026-08', 10, 1_000);

    expect(result.covered).toBe(10);
  });

  it('covers nothing when the plan includes no allowance', async () => {
    const result = await repository.consumeAllowance('tenant-a', 'messages', '2026-08', 10, 0);

    expect(result).toEqual({ covered: 0, uncovered: 10 });
  });
});
