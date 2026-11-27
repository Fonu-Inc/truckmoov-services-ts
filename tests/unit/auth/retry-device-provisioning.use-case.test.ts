import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { FleetFactsService } from '../../../apps/auth/src/fleet-facts.service';
import {
  RetryDeviceProvisioningUseCase,
  SystemDeviceWriteRefusedError,
} from '../../../apps/auth/src/update-system-device.use-cases';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

function actor(role: string, tenantId = 'system') {
  return {
    tokens: { resolveAccessToken: () => ({ id: 'actor-1' }) as never },
    users: { findById: vi.fn(async () => ({ id: 'actor-1', email: 'a@x', role, tenantId, accountStatus: 'enabled' })) },
  };
}

function build(requeue: ReturnType<typeof vi.fn>, role = 'SYSTEM_ADMIN') {
  const { tokens, users } = actor(role);
  return new RetryDeviceProvisioningUseCase(tokens as never, users as never, { requeueProvisioning: requeue } as never);
}

describe('RetryDeviceProvisioningUseCase', () => {
  it('reports how many registrations were re-queued', async () => {
    const requeue = vi.fn(async () => ({ ok: true, requeued: 3 }));
    const result = await build(requeue).execute('tok', ['d1']);
    expect(requeue).toHaveBeenCalledWith(['d1']);
    expect(result.data).toEqual({ requeued: 3 });
  });

  it('turns a fleet refusal into a write refusal', async () => {
    const requeue = vi.fn(async () => ({ ok: false, status: 503, message: 'down' }));
    await expect(build(requeue).execute('tok')).rejects.toBeInstanceOf(SystemDeviceWriteRefusedError);
  });

  it('refuses a caller outside the platform mutator roles', async () => {
    const requeue = vi.fn();
    await expect(build(requeue, 'FLEET_MANAGER').execute('tok')).rejects.toBeInstanceOf(ForbiddenError);
    expect(requeue).not.toHaveBeenCalled();
  });
});

describe('FleetFactsService.requeueProvisioning', () => {
  const service = () =>
    new FleetFactsService({
      auth: { jwtSecret: 'secret', fleetServiceUrl: 'http://fleet:3002' },
      identity: { legacySecret: 'secret', serviceTokenDir: '/nonexistent', serviceAuthDevSecret: '' },
    } as never);

  it('refuses an unsafe id without calling fleet', async () => {
    const post = vi.spyOn(axios, 'post');
    await expect(service().requeueProvisioning(['../x'])).resolves.toMatchObject({ ok: false, status: 400 });
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });
});
