import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InMemoryOrganisationUpgradeRepository } from '../../../apps/auth/src/in-memory-organisation-upgrade.repository';
import {
  FleetSizeUnknownError,
  NotUpgradeableError,
  RequestOrganisationUpgradeUseCase,
  ReviewOrganisationUpgradeUseCase,
  TargetPlanNotFoundError,
  TargetPlanRequiredError,
} from '../../../apps/auth/src/organisation-upgrade.use-cases';
import {
  UpgradeAlreadyDecidedError,
  UpgradeAlreadyRequestedError,
} from '../../../apps/auth/src/organisation-upgrade.repository';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

function harness(
  options: { orgType?: string; role?: string; actorTenant?: string; vehicles?: number | null } = {},
) {
  const requests = new InMemoryOrganisationUpgradeRepository();
  const members = [
    { id: 'u1', role: 'OWNER_OPERATOR', tenantId: 'tenant-a', email: 'a@b.com', passwordHash: 'x', accountStatus: 'enabled', profile: {} },
    { id: 'u2', role: 'DISPATCHER', tenantId: 'tenant-a', email: 'c@d.com', passwordHash: 'x', accountStatus: 'enabled', profile: {} },
  ];
  const saved: Array<Record<string, unknown>> = [];

  const userRepository = {
    findById: async () => ({
      id: 'actor-1',
      role: options.role ?? 'OWNER_OPERATOR',
      tenantId: options.actorTenant ?? (options.role === 'PLATFORM_ADMIN' ? 'system' : 'tenant-a'),
      email: 'a@b.com',
      passwordHash: 'x',
      accountStatus: 'enabled',
      profile: {},
    }),
    findAllByTenant: async () => members,
    save: async (user: Record<string, unknown>) => void saved.push(user),
  } as never;

  const onboardingSaves: Array<Record<string, unknown>> = [];
  const onboarding = {
    findByTenantId: async () => ({
      tenantId: 'tenant-a',
      organizationType: options.orgType ?? 'owner_operator',
      subscription: { planCode: 'plan_starter' },
    }),
    save: async (row: Record<string, unknown>) => void onboardingSaves.push(row),
  } as never;

  const fleet = {
    activeVehicleCount: vi.fn(async () =>
      options.vehicles === undefined ? 9 : options.vehicles,
    ),
  } as never;

  const tokenService = { resolveAccessToken: () => ({ id: 'actor-1' }) } as never;
  const raise = vi.fn(async () => {});
  const notify = vi.fn(async () => {});

  const plans = {
    findByCode: async (code: string) =>
      code === 'plan_pro' ? { id: 'plan-2', code: 'plan_pro' } : null,
  } as never;

  return {
    raise,
    notify,
    requests,
    saved,
    onboardingSaves,
    fleet,
    request: new RequestOrganisationUpgradeUseCase(
      tokenService, userRepository, requests, onboarding, fleet, { raise } as never,
    ),
    review: new ReviewOrganisationUpgradeUseCase(
      tokenService, userRepository, requests, onboarding, fleet, { notify } as never, plans,
    ),
  };
}

describe('asking for a promotion', () => {
  it('records the request with the requester own words', async () => {
    const h = harness();

    const request = await h.request.execute('token', '  Fleet has grown to 9 vehicles  ');

    expect(request.reason).toBe('Fleet has grown to 9 vehicles');
    expect(request.status).toBe('pending');
  });

  it('refuses an organisation that has no upgrade to ask for', async () => {
    const h = harness({ orgType: 'enterprise' });

    await expect(h.request.execute('token', 'we want more')).rejects.toBeInstanceOf(
      NotUpgradeableError,
    );
  });

  // Two open requests would let two reviewers promote the same organisation.
  it('refuses a second open request', async () => {
    const h = harness();
    await h.request.execute('token', 'Fleet has grown to 9 vehicles');

    await expect(
      h.request.execute('token', 'asking again'),
    ).rejects.toBeInstanceOf(UpgradeAlreadyRequestedError);
  });
});

describe('reviewing', () => {
  let h: ReturnType<typeof harness>;
  let requestId: string;

  beforeEach(async () => {
    h = harness({ role: 'PLATFORM_ADMIN' });
    const requester = harness();
    const created = await requester.request.execute('token', 'Fleet has grown to 9 vehicles');
    await h.requests.save(created);
    requestId = created.id;
  });

  it('refuses a caller who is not platform staff', async () => {
    const tenant = harness({ role: 'FLEET_ADMIN' });

    await expect(tenant.review.list('token')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a platform admin held inside a customer tenant', async () => {
    const misplaced = harness({ role: 'PLATFORM_ADMIN', actorTenant: 'tenant-a' });

    await expect(misplaced.review.list('token')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('promotes the organisation type', async () => {
    await h.review.approve('token', requestId, 'looks right', 'plan_pro');

    expect(h.onboardingSaves[0]).toMatchObject({ organizationType: 'enterprise' });
  });

  it('changes the tenant plan to the reviewer-chosen target plan', async () => {
    await h.review.approve('token', requestId, null, 'plan_pro');

    expect(h.onboardingSaves[0]).toMatchObject({ subscription: { planCode: 'plan_pro' } });
  });

  it('records the target plan on the decision', async () => {
    const decided = await h.review.approve('token', requestId, null, 'plan_pro');

    expect(decided.targetPlanCode).toBe('plan_pro');
  });

  it('refuses to approve without a target plan', async () => {
    await expect(
      h.review.approve('token', requestId, null, null),
    ).rejects.toBeInstanceOf(TargetPlanRequiredError);
    expect(h.onboardingSaves).toHaveLength(0);
  });

  it('refuses to approve an unknown plan code', async () => {
    await expect(
      h.review.approve('token', requestId, null, 'made_up_plan'),
    ).rejects.toBeInstanceOf(TargetPlanNotFoundError);
    expect(h.onboardingSaves).toHaveLength(0);
  });

  // Promoting the organisation and not the people in it leaves them without
  // the permissions the new type carries.
  it('promotes every owner-operator in the organisation', async () => {
    await h.review.approve('token', requestId, null, 'plan_pro');

    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]).toMatchObject({ id: 'u1', role: 'ENTERPRISE_ADMIN' });
  });

  it('promotes a request raised for fleet provider to fleet provider', async () => {
    const legacy = await h.requests.findById(requestId);
    await h.requests.save({ ...legacy!, toOrganisationType: 'fleet_provider' });

    await h.review.approve('token', requestId, null, 'plan_pro');

    expect(h.onboardingSaves[0]).toMatchObject({ organizationType: 'fleet_provider' });
    expect(h.saved[0]).toMatchObject({ id: 'u1', role: 'FLEET_ADMIN' });
  });

  it('leaves other roles in the organisation alone', async () => {
    await h.review.approve('token', requestId, null, 'plan_pro');

    expect(h.saved.map((user) => user.id)).not.toContain('u2');
  });

  it('records the live count that justified the decision', async () => {
    const decided = await h.review.approve('token', requestId, null, 'plan_pro');

    expect(decided.vehicleCountAtReview).toBe(9);
  });

  // A count of zero would approve a promotion nothing justifies.
  it('refuses to decide when the fleet size cannot be read', async () => {
    const blind = harness({ role: 'PLATFORM_ADMIN', vehicles: null });
    await blind.requests.save(
      await harness().request.execute('token', 'Fleet has grown to 9 vehicles'),
    );
    const pending = (await blind.requests.findByStatus('pending'))[0];

    await expect(
      blind.review.approve('token', pending.id, null, 'plan_pro'),
    ).rejects.toBeInstanceOf(FleetSizeUnknownError);
  });

  it('changes nothing when it refuses to decide', async () => {
    const blind = harness({ role: 'PLATFORM_ADMIN', vehicles: null });
    await blind.requests.save(
      await harness().request.execute('token', 'Fleet has grown to 9 vehicles'),
    );
    const pending = (await blind.requests.findByStatus('pending'))[0];

    await expect(blind.review.approve('token', pending.id, null, 'plan_pro')).rejects.toThrow();
    expect(blind.onboardingSaves).toHaveLength(0);
  });

  it('captures reviewer notes at decision time', async () => {
    const decided = await h.review.reject('token', requestId, '  too few vehicles  ');

    expect(decided.reviewerNotes).toBe('too few vehicles');
    expect(decided.status).toBe('rejected');
  });

  it('refuses to decide the same request twice', async () => {
    await h.review.approve('token', requestId, null, 'plan_pro');

    await expect(
      h.review.approve('token', requestId, null, 'plan_pro'),
    ).rejects.toBeInstanceOf(UpgradeAlreadyDecidedError);
  });

  it('shows the live count in the queue, not the one that was claimed', async () => {
    const queue = await h.review.list('token');

    expect(queue.pending[0].currentVehicleCount).toBe(9);
    expect(h.fleet.activeVehicleCount).toHaveBeenCalled();
  });
});

describe('telling people what happened', () => {
  it('alerts staff that a request is waiting', async () => {
    const h = harness();

    await h.request.execute('token', 'Fleet has grown to 9 vehicles');

    expect(h.raise).toHaveBeenCalledTimes(1);
    expect(h.raise.mock.calls[0][0]).toMatchObject({ alertType: 'new_tenant_signup' });
  });

  // A decision nobody hears about leaves the requester capped with no idea why.
  it('tells the requester when it is approved', async () => {
    const h = harness({ role: 'PLATFORM_ADMIN' });
    const created = await harness().request.execute('token', 'Fleet has grown to 9 vehicles');
    await h.requests.save(created);

    await h.review.approve('token', created.id, null, 'plan_pro');

    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0][0]).toMatchObject({ notificationType: 'organisation_upgrade_decision' });
  });

  it('tells the requester why it was refused', async () => {
    const h = harness({ role: 'PLATFORM_ADMIN' });
    const created = await harness().request.execute('token', 'Fleet has grown to 9 vehicles');
    await h.requests.save(created);

    await h.review.reject('token', created.id, 'only 3 vehicles');

    expect(h.notify.mock.calls[0][0].content).toContain('only 3 vehicles');
  });

  it('says nothing when the decision was refused for lack of a live count', async () => {
    const h = harness({ role: 'PLATFORM_ADMIN', vehicles: null });
    const created = await harness().request.execute('token', 'Fleet has grown to 9 vehicles');
    await h.requests.save(created);

    await expect(h.review.approve('token', created.id, null, 'plan_pro')).rejects.toThrow();

    expect(h.notify).not.toHaveBeenCalled();
  });
});
