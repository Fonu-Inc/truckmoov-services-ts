import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { EmailNotVerifiedError, ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';
import { InstallerAuthController } from '../../../apps/auth/src/installer-auth.controller';
import type { InstallerLoginUseCase } from '../../../apps/auth/src/contexts/installation/application/use-cases/installer-login.use-case';
import type { LoginEvents } from '../../../apps/auth/src/login-events';
import type { ActivityLogService } from '../../../apps/auth/src/activity-log.service';

function controller(error: Error) {
  const installerLogin = {
    execute: async () => { throw error; },
    completeTwoFactor: async () => { throw error; },
  } as unknown as InstallerLoginUseCase;
  const loginEvents = {
    recordingFailure: async (_o: unknown, _e: unknown, step: () => Promise<unknown>) => step(),
  } as unknown as LoginEvents;
  return new InstallerAuthController(installerLogin, loginEvents, {} as ActivityLogService);
}

describe('Installer sign-in refusals', () => {
  it.each([
    ['a non-installer with the right password', new ForbiddenError('This endpoint is reserved for installers')],
    ['an unverified account', new EmailNotVerifiedError()],
  ])('answers %s as a missing route, never a 403', async (_, error) => {
    const sut = controller(error);

    await expect(sut.login({ email: 'a@x.com', password: 'pw' }, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      sut.loginTwoFactor({ challengeToken: 't', code: '123456' }, { ip: '1.1.1.1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
