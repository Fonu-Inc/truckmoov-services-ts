import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { TenantStatusService } from '../../../apps/fleet/src/tenant-status.service';
import { TenantActiveGuard } from '../../../apps/fleet/src/tenant-active.guard';
import { signBusEvent } from '@shared/eventbus';
import axios from 'axios';

vi.mock('axios');
const mockedGet = vi.mocked(axios.get);

const SECRET = 'test-secret';

function config(cacheSeconds = 30) {
  return {
    auth: { serviceUrl: 'http://auth:3001', tenantStatusCacheSeconds: cacheSeconds },
    persistence: { backend: 'mikro-orm' },
    eventSigningSecret: SECRET,
    eventAcceptUnsigned: false,
  } as never;
}

type Handlers = Record<string, (event: Record<string, unknown>) => Promise<void>>;

function bus(handlers: Handlers) {
  return {
    subscribeEveryInstance: vi.fn(async (subject: string, handler: never) => {
      const raw = handler as (event: unknown, meta: { subject: string }) => Promise<void>;
      const concrete = (event: Record<string, unknown>) => subject.replace('*', String(event.tenant_id));
      handlers[subject] = async (event) =>
        raw(signBusEvent(SECRET, concrete(event), event as never), { subject: concrete(event) });
      handlers[`raw:${subject}`] = async (event) => raw(event, { subject: concrete(event) });
      return async () => {};
    }),
    publish: vi.fn(async () => {}),
    isReady: vi.fn(async () => true),
  } as never;
}

function authReplies(active: boolean, status = 200) {
  mockedGet.mockResolvedValue({ status, data: { data: { active } } } as never);
}

describe('TenantStatusService', () => {
  let handlers: Handlers;
  let service: TenantStatusService;

  beforeEach(async () => {
    vi.clearAllMocks();
    handlers = {};
    service = new TenantStatusService(config(), bus(handlers));
    await service.onApplicationBootstrap();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks auth for a tenant it has never seen', async () => {
    authReplies(true);

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('refuses a tenant auth reports as inactive', async () => {
    authReplies(false);

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(false);
  });

  it('does not ask auth again while the answer is fresh', async () => {
    authReplies(true);

    await service.isActive('tenant-a', 'token');
    await service.isActive('tenant-a', 'token');

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cached answer goes stale', async () => {
    vi.useFakeTimers();
    authReplies(true);

    await service.isActive('tenant-a', 'token');
    vi.advanceTimersByTime(31_000);
    await service.isActive('tenant-a', 'token');

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  // The event mechanism on its own.
  it('marks a tenant suspended the moment the event arrives, without asking auth', async () => {
    await handlers['tm.*.tenant.suspended']({ tenant_id: 'tenant-a' });

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(false);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('ignores an unsigned suspension event', async () => {
    authReplies(true);

    await handlers['raw:tm.*.tenant.suspended']({ tenant_id: 'tenant-a' });

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('ignores a suspension event with a wrong signature', async () => {
    authReplies(true);

    await handlers['raw:tm.*.tenant.suspended']({ tenant_id: 'tenant-a', bsig: 'f'.repeat(64) });

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(true);
  });

  it('re-confirms a reinstatement with auth rather than trusting the event', async () => {
    await handlers['tm.*.tenant.suspended']({ tenant_id: 'tenant-a' });
    authReplies(true);

    await handlers['tm.*.tenant.reinstated']({ tenant_id: 'tenant-a' });

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('leaves other tenants alone when one is suspended', async () => {
    await handlers['tm.*.tenant.suspended']({ tenant_id: 'tenant-a' });
    authReplies(true);

    await expect(service.isActive('tenant-b', 'token')).resolves.toBe(true);
  });

  // The query mechanism on its own: a pod that started after the event.
  it('catches a suspension it never saw an event for', async () => {
    const freshPod = new TenantStatusService(config(), bus({}));
    authReplies(false);

    await expect(freshPod.isActive('tenant-a', 'token')).resolves.toBe(false);
  });

  it('treats a 401 from auth as suspended', async () => {
    mockedGet.mockResolvedValue({ status: 401, data: {} } as never);

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(false);
  });

  it('keeps serving an unknown tenant when auth is unreachable', async () => {
    mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(true);
  });

  it('keeps refusing a known-suspended tenant when auth is unreachable', async () => {
    await handlers['tm.*.tenant.suspended']({ tenant_id: 'tenant-a' });
    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);
    mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.isActive('tenant-a', 'token')).resolves.toBe(false);
  });


  it('does not consult auth on the in-memory backend, where there is none to ask', async () => {
    const inMemory = new TenantStatusService(
      { auth: { serviceUrl: 'http://auth:3001', tenantStatusCacheSeconds: 30 }, persistence: { backend: 'in-memory' } } as never,
      bus({}),
    );

    await expect(inMemory.isActive('tenant-a', 'token')).resolves.toBe(true);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('backs off after an unreachable auth instead of retrying every request', async () => {
    mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await service.isActive('tenant-a', 'token');
    await service.isActive('tenant-a', 'token');
    await service.isActive('tenant-a', 'token');

    // One attempt, not three: an auth outage must not multiply into a connect
    // timeout on every request fleet serves.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('retries once the back-off window passes', async () => {
    vi.useFakeTimers();
    mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));

    await service.isActive('tenant-a', 'token');
    vi.advanceTimersByTime(6_000);
    await service.isActive('tenant-a', 'token');

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('starts up even when the event bus refuses the subscription', async () => {
    const brokenBus = {
      subscribeEveryInstance: vi.fn(async () => {
        throw new Error('nats down');
      }),
    } as never;
    const degraded = new TenantStatusService(config(), brokenBus);

    await expect(degraded.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

describe('TenantActiveGuard', () => {
  function context(user: unknown, authorization?: string) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization }, user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
  }

  function build(active: boolean, skip = false) {
    const status = { isActive: vi.fn(async () => active) };
    const guard = new TenantActiveGuard(
      { getAllAndOverride: () => skip } as never,
      status as never,
    );
    return { guard, status };
  }

  it('admits an active tenant', async () => {
    const { guard } = build(true);

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a' }, 'Bearer token')),
    ).resolves.toBe(true);
  });

  it('refuses a suspended tenant', async () => {
    const { guard } = build(false);

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a' }, 'Bearer token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a read as well as a write, because suspension is a total lockout', async () => {
    const { guard } = build(false);

    // The guard does not look at the method at all, which is the guarantee.
    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a' }, 'Bearer token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is a no-op on an unauthenticated route, so the readiness probe still answers', async () => {
    const { guard, status } = build(false);

    await expect(guard.canActivate(context(undefined))).resolves.toBe(true);
    expect(status.isActive).not.toHaveBeenCalled();
  });

  it('is a no-op when a route opts out', async () => {
    const { guard, status } = build(false, true);

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a' }, 'Bearer token')),
    ).resolves.toBe(true);
    expect(status.isActive).not.toHaveBeenCalled();
  });

  it('does not check when the request carries no bearer token', async () => {
    const { guard, status } = build(false);

    await expect(guard.canActivate(context({ tenantId: 'tenant-a' }))).resolves.toBe(true);
    expect(status.isActive).not.toHaveBeenCalled();
  });
});
