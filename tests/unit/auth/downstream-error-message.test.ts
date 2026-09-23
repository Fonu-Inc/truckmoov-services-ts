import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { FleetFactsService } from '../../../apps/auth/src/fleet-facts.service';

function service() {
  return new FleetFactsService({
    auth: { jwtSecret: 'secret', fleetServiceUrl: 'http://fleet:3002' },
    identity: { legacySecret: 'secret', serviceTokenDir: '/nonexistent', serviceAuthDevSecret: '' },
  } as never);
}

describe('Downstream error messages', () => {
  // A bad device id used to come back as "Cannot POST /fleet/internal/...",
  // handing the caller the service topology.
  it('does not forward the unmatched-route message from fleet', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 404,
      data: { message: 'Cannot POST /fleet/internal/devices/abc/suspend' },
    } as never);

    const result = await service().setDeviceSuspension('abc', 'suspend');

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect((result as { message: string }).message).toBe('The device service refused the change');
    post.mockRestore();
  });

  it('still forwards a message the device service meant to send', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 400,
      data: { message: 'This device is already suspended' },
    } as never);

    const result = await service().setDeviceSuspension('abc', 'suspend');

    expect((result as { message: string }).message).toBe('This device is already suspended');
    post.mockRestore();
  });
});
