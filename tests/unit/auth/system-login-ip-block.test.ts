import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IpBlockGuard } from '../../../apps/auth/src/ip-block.guard';
import { LoginEvents } from '../../../apps/auth/src/login-events';
import { SystemController } from '../../../apps/auth/src/system.controller';
import { InvalidCredentialsError } from '../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-credentials.error';

describe('admin sign-in', () => {
  it.each(['systemLogin', 'systemLoginTwoFactor'] as const)('%s is behind the IP block', (method) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SystemController.prototype[method])).toContain(IpBlockGuard);
  });

  it('records a failed password step for auto-block', async () => {
    const execute = vi.fn(async () => {});
    const controller = Object.assign(Object.create(SystemController.prototype), {
      twoFactorLogin: { start: async () => { throw new InvalidCredentialsError(); } },
      loginEvents: new LoginEvents({ execute } as never),
    }) as SystemController;

    await expect(controller.systemLogin({ email: 'a@example.com', password: 'x' } as never, { ip: '1.2.3.4' })).rejects.toThrow();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', email: 'a@example.com', ipAddress: '1.2.3.4' }));
  });
});
