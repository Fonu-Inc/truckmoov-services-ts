import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryPlanEntitlementsRepository } from '../../../apps/auth/src/in-memory-plan-entitlements.repository';
import { PlanEntitlementsBootstrapService } from '../../../apps/auth/src/plan-entitlements-bootstrap.service';
import { EntitlementService } from '../../../apps/auth/src/entitlement.service';
import { PLAN_ENTITLEMENT_SEEDS } from '../../../apps/auth/src/plan-entitlement-seeds';
import { UNLIMITED } from '../../../apps/auth/src/plan-entitlements';

function plans() {
  return {
    findAll: async () => [
      { tier: 'starter', code: 'plan_starter_abc' },
      { tier: 'professional', code: 'plan_pro_def' },
      { tier: 'enterprise', code: 'plan_ent_ghi' },
    ],
  } as never;
}

describe('seeding plan entitlements', () => {
  let repository: InMemoryPlanEntitlementsRepository;
  let service: PlanEntitlementsBootstrapService;

  beforeEach(() => {
    repository = new InMemoryPlanEntitlementsRepository();
    service = new PlanEntitlementsBootstrapService(plans(), repository);
  });

  it('gives every seeded plan entitlements', async () => {
    const result = await service.seed();

    expect(result.seeded).toBe(PLAN_ENTITLEMENT_SEEDS.length);
    expect(await repository.findByPlanCode('plan_starter_abc')).toBeTruthy();
  });

  it('resolves the plan code for this deployment, not the tier name', async () => {
    await service.seed();

    expect(await repository.findByPlanCode('starter')).toBeNull();
    expect((await repository.findByPlanCode('plan_starter_abc'))?.planCode).toBe('plan_starter_abc');
  });

  it('resolves inheritance to a real plan code', async () => {
    await service.seed();

    const professional = await repository.findByPlanCode('plan_pro_def');
    expect(professional?.inheritsFromCode).toBe('plan_starter_abc');
  });

  it('runs twice without duplicating or overwriting', async () => {
    await service.seed();
    await repository.save(
      { ...(await repository.findByPlanCode('plan_starter_abc'))!, trialDays: 99 },
      null,
    );

    const second = await service.seed();

    expect(second.seeded).toBe(0);
    // An operator's edit survives a restart.
    expect((await repository.findByPlanCode('plan_starter_abc'))?.trialDays).toBe(99);
  });

  it('skips a tier with no plan in this deployment', async () => {
    const partial = new PlanEntitlementsBootstrapService(
      { findAll: async () => [{ tier: 'starter', code: 'plan_starter_abc' }] } as never,
      repository,
    );

    const result = await partial.seed();

    expect(result.seeded).toBe(1);
    expect(await repository.findByPlanCode('plan_pro_def')).toBeNull();
  });
});

describe('what the seeds actually entitle', () => {
  let service: EntitlementService;

  beforeEach(async () => {
    const repository = new InMemoryPlanEntitlementsRepository();
    await new PlanEntitlementsBootstrapService(plans(), repository).seed();
    service = new EntitlementService(repository);
  });

  it('matches what the Starter card claims', async () => {
    const starter = await service.effectiveFor('plan_starter_abc');

    expect(starter.quotas.vehicles).toBe(25);
    expect(starter.trialDays).toBe(14);
  });

  it('gives Enterprise unlimited rather than a large number', async () => {
    const enterprise = await service.effectiveFor('plan_ent_ghi');

    expect(enterprise.quotas.vehicles).toBe(UNLIMITED);
    await expect(service.assertQuota('plan_ent_ghi', 'vehicles', 100_000)).resolves.toBeUndefined();
  });

  it('carries Starter features up through the chain to Enterprise', async () => {
    const enterprise = await service.effectiveFor('plan_ent_ghi');

    // Inherited two levels: Starter -> Professional -> Enterprise.
    expect(enterprise.features.map((f) => f.key)).toContain('fleet_management');
    expect(enterprise.features.map((f) => f.key)).toContain('api_access');
    expect(enterprise.features.map((f) => f.key)).toContain('sso');
  });

  it('lets a higher plan raise a limit the lower one set', async () => {
    expect(await service.featureLimitFor('plan_starter_abc', 'geofencing')).toBe(5);
    expect(await service.featureLimitFor('plan_pro_def', 'geofencing')).toBe(50);
    expect(await service.featureLimitFor('plan_ent_ghi', 'geofencing')).toBeNull();
  });

  it('gives each plan a larger message allowance than the one below', async () => {
    const starter = await service.monthlyAllowance('plan_starter_abc', 'messages');
    const professional = await service.monthlyAllowance('plan_pro_def', 'messages');
    const enterprise = await service.monthlyAllowance('plan_ent_ghi', 'messages');

    expect(professional).toBeGreaterThan(starter);
    expect(enterprise).toBeGreaterThan(professional);
  });

  it('refuses the vehicle past the Starter quota', async () => {
    await expect(service.assertQuota('plan_starter_abc', 'vehicles', 24)).resolves.toBeUndefined();
    await expect(service.assertQuota('plan_starter_abc', 'vehicles', 25)).rejects.toThrow();
  });
});
