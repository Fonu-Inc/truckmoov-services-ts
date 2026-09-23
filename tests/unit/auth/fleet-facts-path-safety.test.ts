import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { FleetFactsService } from '../../../apps/auth/src/fleet-facts.service';

/**
 * Every id these calls put in a URL arrives from a request, and the token they
 * carry is a cross-tenant platform-admin one. A traversal sequence in an id
 * would walk out of the intended route and reach any internal fleet endpoint
 * with those privileges.
 */
const TRAVERSAL_IDS = [
  '../../../../fleet/internal/tenants/other/vehicles',
  '..%2f..%2fadmin',
  'veh-1/../../devices',
  'a'.repeat(65),
  '',
  'veh 1',
  'veh?query=1',
  'veh#fragment',
];

function service() {
  return new FleetFactsService({
    auth: { jwtSecret: 'secret', fleetServiceUrl: 'http://fleet:3002' },
    identity: { legacySecret: 'secret', serviceTokenDir: '/nonexistent', serviceAuthDevSecret: '' },
  } as never);
}

describe('Fleet path safety', () => {
  it('refuses a traversal id rather than calling out with it', async () => {
    const get = vi.spyOn(axios, 'get');

    for (const recordId of TRAVERSAL_IDS) {
      await expect(service().contextSnapshot('tenant-1', 'device', recordId)).resolves.toBeNull();
    }
    // The point of the test: nothing was requested at all.
    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });

  it('refuses a traversal tenant id on every call that takes one', async () => {
    const get = vi.spyOn(axios, 'get');

    await expect(service().tenantResource('../../etc', 'vehicles')).resolves.toBeNull();
    await expect(service().contextSnapshot('../../etc', 'device', 'veh-1')).resolves.toBeNull();

    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });

  it('refuses a traversal device id on suspension', async () => {
    const post = vi.spyOn(axios, 'post');

    const result = await service().setDeviceSuspension('../../../tenants/x', 'suspend');

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('still calls out for an ordinary id', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ status: 200, data: { data: { imei: '123' } } } as never);

    await expect(service().contextSnapshot('tenant-1', 'device', 'dev_1-A')).resolves.toEqual({
      imei: '123',
    });
    expect(get).toHaveBeenCalledWith(
      'http://fleet:3002/fleet/internal/tenants/tenant-1/context/device/dev_1-A',
      expect.anything(),
    );
    get.mockRestore();
  });
});
