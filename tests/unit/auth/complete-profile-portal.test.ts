import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PORTALS_KEY } from '@shared/access';
import { AuthController } from '../../../apps/auth/src/auth.controller';

describe('POST /auth/complete-profile', () => {
  // The caller is an invited user with no session yet; the controller's tenant portal would hide it.
  it('is public', () => {
    expect(Reflect.getMetadata(PORTALS_KEY, AuthController.prototype.completeProfile)).toEqual(['public']);
  });
});
