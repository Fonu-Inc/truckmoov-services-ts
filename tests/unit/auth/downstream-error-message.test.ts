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

    expect((result as { message: string }).message).not.toContain('/fleet/internal');
    post.mockRestore();
  });

  // Fleet's own route fallback, or a refusal dressed as one, is the service
  // failing: reporting it as a missing device sent QA chasing the wrong fault.
  it('reports a route-missing 404 from fleet as the service being unavailable', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 404,
      data: { message: 'Cannot POST /fleet/internal/devices/abc/reinstate' },
    } as never);

    const result = await service().setDeviceSuspension('abc', 'reinstate');

    expect(result).toEqual({ ok: false, status: 503, message: 'The device service could not complete the change' });
    post.mockRestore();
  });

  it('passes a real missing-device 404 through', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 404,
      data: { message: 'Device abc was not found' },
    } as never);

    const result = await service().setDeviceSuspension('abc', 'suspend');

    expect(result).toEqual({ ok: false, status: 404, message: 'Device abc was not found' });
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
