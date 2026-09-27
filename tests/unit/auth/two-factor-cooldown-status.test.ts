import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { SystemController } from '../../../apps/auth/src/system.controller';
import { TwoFactorCooldownError } from '../../../apps/auth/src/two-factor-attempts';

describe('the admin code step during a cooldown', () => {
  it('answers 429 with the seconds left', async () => {
    const controller = Object.assign(Object.create(SystemController.prototype), {
      twoFactorLogin: {
        complete: async () => {
          throw new TwoFactorCooldownError(42);
        },
      },
    }) as SystemController;

    const error = await controller
      .systemLoginTwoFactor({ challengeToken: 'challenge', code: '123456' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toEqual({
      message: 'Too many wrong codes, try again in 42 seconds',
      retryAfterSeconds: 42,
    });
  });
});
