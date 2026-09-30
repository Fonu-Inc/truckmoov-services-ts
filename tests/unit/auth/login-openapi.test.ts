import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { AuthController } from '../../../apps/auth/src/auth.controller';
import { InstallerAuthController } from '../../../apps/auth/src/installer-auth.controller';
import { SystemController } from '../../../apps/auth/src/system.controller';
import { TwoFactorController } from '../../../apps/auth/src/two-factor.controller';

type Documented = { type?: unknown; schema?: { oneOf?: Array<{ $ref: string }> } };

function responses(prototype: object, name: string): Record<string, Documented> {
  return Reflect.getMetadata(DECORATORS.API_RESPONSE, (prototype as Record<string, object>)[name]) ?? {};
}

describe('Login OpenAPI contract', () => {
  it.each([
    ['AuthController.login', AuthController.prototype, 'login'],
    ['InstallerAuthController.login', InstallerAuthController.prototype, 'login'],
  ])('%s documents the session and the two-factor challenge', (_, prototype, name) => {
    const refs = responses(prototype, name)['201']?.schema?.oneOf?.map((entry) => entry.$ref) ?? [];

    expect(refs).toEqual(['#/components/schemas/LoginSessionResponse', '#/components/schemas/TwoFactorChallengeResponse']);
  });

  it.each([
    ['AuthController.loginTwoFactor', AuthController.prototype, 'loginTwoFactor'],
    ['InstallerAuthController.loginTwoFactor', InstallerAuthController.prototype, 'loginTwoFactor'],
  ])('%s documents the session and its refusals', (_, prototype, name) => {
    const documented = responses(prototype, name);

    expect(documented['201']?.type).toBeTruthy();
    for (const status of ['400', '401', '403']) expect(documented[status]?.type).toBeTruthy();
  });

  it.each([
    ['AuthController.loginTwoFactor', AuthController.prototype, 'loginTwoFactor'],
    ['InstallerAuthController.loginTwoFactor', InstallerAuthController.prototype, 'loginTwoFactor'],
    ['SystemController.systemLoginTwoFactor', SystemController.prototype, 'systemLoginTwoFactor'],
    ['TwoFactorController.confirmEnrolment', TwoFactorController.prototype, 'confirmEnrolment'],
    ['TwoFactorController.disableTwoFactor', TwoFactorController.prototype, 'disableTwoFactor'],
  ])('%s documents the per-IP limit and the wrong-code cooldown', (_, prototype, name) => {
    const refs = responses(prototype, name)['429']?.schema?.oneOf?.map((entry) => entry.$ref) ?? [];

    expect(refs).toEqual(['#/components/schemas/CodeCooldownErrorBody', '#/components/schemas/ApiErrorBody']);
  });

  it('SystemController.systemLogin documents the session, the code challenge and the enrolment challenge', () => {
    const refs = responses(SystemController.prototype, 'systemLogin')['201']?.schema?.oneOf?.map((entry) => entry.$ref) ?? [];

    expect(refs).toEqual([
      '#/components/schemas/LoginSessionResponse',
      '#/components/schemas/TwoFactorChallengeResponse',
      '#/components/schemas/EnrolmentChallengeResponse',
    ]);
  });

  it('SystemController.systemLoginTwoFactor documents the session with its recovery codes', () => {
    expect(responses(SystemController.prototype, 'systemLoginTwoFactor')['201']?.type).toBeTruthy();
  });
});
