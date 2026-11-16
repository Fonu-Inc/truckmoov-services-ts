import { describe, expect, it } from 'vitest';
import { ServiceCaller } from '@shared/identity';
import { InternalCallerService } from '../../../apps/auth/src/internal-caller.service';

const DEV = 'dev-secret';

function service() {
  return new InternalCallerService(
    { identity: { legacySecret: '', serviceTokenDir: '/nonexistent', serviceAuthDevSecret: DEV } } as never,
  );
}

const call = (caller: string, tenantId?: string) =>
  new ServiceCaller({ self: caller, tokenDir: '/nonexistent', devSecret: DEV, legacySecret: '' }).headers('auth', {
    tenantId,
  })!;

describe('callers of auth service-to-service routes', () => {
  it('gives the tenant a listed service acts for', async () => {
    expect(await service().tenantFor(call('fleet', 'tenant-a'), ['fleet'])).toBe('tenant-a');
  });

  it('refuses a service the route does not serve', async () => {
    expect(await service().tenantFor(call('tracking', 'tenant-a'), ['fleet'])).toBeNull();
  });

  it('refuses a service call acting for no tenant', async () => {
    expect(await service().tenantFor(call('fleet'), ['fleet'])).toBeNull();
  });

  it('refuses a user token without a service token', async () => {
    expect(await service().tenantFor({ authorization: 'Bearer user', 'x-acting-for-tenant': 'tenant-b' }, ['fleet'])).toBeNull();
  });
});
