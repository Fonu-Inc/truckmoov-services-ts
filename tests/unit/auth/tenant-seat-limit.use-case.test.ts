import { describe, expect, it } from 'vitest';
import {
  CheckTenantSeatLimitUseCase,
  TenantSeatLimitReachedError,
} from '../../../apps/auth/src/check-tenant-seat-limit.use-case';
import type {
  StoredSubscriptionPlan,
  SubscriptionPlanTier,
} from '../../../apps/auth/src/subscription-plan.repository';
import type { StoredTenantOnboarding } from '../../../apps/auth/src/tenant-onboarding.repository';
import type { StoredUser } from '../../../apps/auth/src/contexts/auth/session/domain/ports/user-repository.port';
import type { StoredInvite } from '../../../apps/auth/src/contexts/auth/session/domain/ports/invite-repository.port';

const TENANT = 't1';
const ACCESS_TOKEN = 'token-admin';

function buildPlan(maxUsers: number | null): StoredSubscriptionPlan {
  return {
    id: 'subscription-plan-starter',
    code: 'plan_starter_abc123',
    tier: 'starter' as SubscriptionPlanTier,
    name: 'Starter',
    description: '',
    monthlyPriceNgn: 50000,
    yearlyMonthlyEquivalentNgn: 45000,
    yearlyDiscountPercent: 10,
    maxActiveVehicles: 25,
    maxUsers,
    customPricing: false,
    trialDays: null,
    badge: null,
    ctaLabel: 'Select Plan',
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildUser(id: string, accountStatus: 'enabled' | 'disabled'): StoredUser {
  return {
    id,
    email: `${id}@t1.com`,
    passwordHash: 'x',
    role: 'ENTERPRISE_ADMIN',
    tenantId: TENANT,
    accountStatus,
  };
}

function buildHarness(opts: {
  onboarding: StoredTenantOnboarding | null;
  plan: StoredSubscriptionPlan | null;
  users: StoredUser[];
  pendingInvites: number;
}) {
  const tokenService = {
    resolveAccessToken: () => ({ id: 'admin1' }) as never,
  };
  const userRepository = {
    findById: async () => buildUser('admin1', 'enabled'),
    findAllByTenant: async () => opts.users,
  };
  const inviteRepository = {
    listPendingByTenant: async () =>
      Array.from({ length: opts.pendingInvites }, (_, i) => ({
        id: `inv-${i}`,
      })) as StoredInvite[],
  };
  const planRepository = { findByCode: async () => opts.plan };
  const onboardingRepository = { findByTenantId: async () => opts.onboarding };

  return new CheckTenantSeatLimitUseCase(
    tokenService as never,
    planRepository as never,
    onboardingRepository as never,
    userRepository as never,
    inviteRepository as never,
  );
}

const onboarding = {
  subscription: { planCode: 'plan_starter_abc123' },
} as StoredTenantOnboarding;

describe('CheckTenantSeatLimitUseCase', () => {
  it('throws when active users + pending invites reach the cap', async () => {
    const useCase = buildHarness({
      onboarding,
      plan: buildPlan(2),
      users: [buildUser('admin1', 'enabled')],
      pendingInvites: 1,
    });
    await expect(useCase.ensureSeatAvailable(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      TenantSeatLimitReachedError,
    );
  });

  it('allows when there is a free seat', async () => {
    const useCase = buildHarness({
      onboarding,
      plan: buildPlan(2),
      users: [buildUser('admin1', 'enabled')],
      pendingInvites: 0,
    });
    await expect(
      useCase.ensureSeatAvailable(ACCESS_TOKEN),
    ).resolves.toBeUndefined();
  });

  it('ignores disabled users when counting seats', async () => {
    const useCase = buildHarness({
      onboarding,
      plan: buildPlan(2),
      users: [
        buildUser('admin1', 'enabled'),
        buildUser('left', 'disabled'),
      ],
      pendingInvites: 0,
    });
    await expect(
      useCase.ensureSeatAvailable(ACCESS_TOKEN),
    ).resolves.toBeUndefined();
  });

  it('does not enforce when the tenant has no onboarding/plan', async () => {
    const useCase = buildHarness({
      onboarding: null,
      plan: null,
      users: [buildUser('admin1', 'enabled'), buildUser('b', 'enabled')],
      pendingInvites: 5,
    });
    await expect(
      useCase.ensureSeatAvailable(ACCESS_TOKEN),
    ).resolves.toBeUndefined();
  });

  it('does not enforce on an unlimited plan (maxUsers null)', async () => {
    const useCase = buildHarness({
      onboarding,
      plan: buildPlan(null),
      users: [buildUser('admin1', 'enabled'), buildUser('b', 'enabled')],
      pendingInvites: 5,
    });
    await expect(
      useCase.ensureSeatAvailable(ACCESS_TOKEN),
    ).resolves.toBeUndefined();
  });
});
