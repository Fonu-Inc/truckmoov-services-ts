import { beforeEach, describe, expect, it } from 'vitest';
import { totpCodeAt } from '@shared/crypto';
import { AuthUser } from '../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { InMemoryTwoFactorRepository } from '../../../apps/auth/src/mikro-two-factor.repository';
import { AdminTwoFactorLogin, InvalidChallengeError } from '../../../apps/auth/src/admin-two-factor-login.use-case';
import { InvalidTwoFactorCodeError } from '../../../apps/auth/src/two-factor.use-cases';

const staff = { id: 'staff-1', email: 'staff@truckmoov.com', role: 'SYSTEM_ADMIN', tenantId: 'system' };
const cipher = { encrypt: (s: string) => ({ ciphertext: `enc:${s}` }), decrypt: (c: string) => c.slice(4) };
const login = {
  verifyForAudience: async () => AuthUser.create(staff),
  issueSession: async (user: AuthUser) => ({ accessToken: 'access', refreshToken: 'refresh', user: user.toPrimitives() }),
};

async function build(required: boolean) {
  const users = new InMemoryUserRepository();
  await users.save({ ...staff, passwordHash: 'x' });
  const enrolments = new InMemoryTwoFactorRepository();
  const config = { adminTwoFactorRequired: required, auth: { jwtSecret: 'challenge-secret' } };
  return {
    flow: new AdminTwoFactorLogin(login as never, users, enrolments, cipher as never, config as never),
    enrolments,
  };
}

const credentials = { email: staff.email, password: 'Password123!' };

describe('admin sign-in with a second factor', () => {
  it('opens a session on the password alone until two-factor is required', async () => {
    const { flow } = await build(false);
    expect((await flow.start(credentials)).kind).toBe('session');
  });

  describe('when required', () => {
    let h: Awaited<ReturnType<typeof build>>;
    beforeEach(async () => {
      h = await build(true);
    });

    it('enrols an admin who never set up an authenticator, and hands out recovery codes once', async () => {
      const started = await h.flow.start(credentials);
      if (started.kind !== 'enrolment') throw new Error(`expected enrolment, got ${started.kind}`);

      const session = await h.flow.complete(started.challengeToken, totpCodeAt(started.secret, Date.now()));

      expect(session.accessToken).toBe('access');
      expect(session.recoveryCodes).toHaveLength(8);
    });

    it('never opens a session on the password alone', async () => {
      const started = await h.flow.start(credentials);
      expect(started.kind).not.toBe('session');
    });

    it('asks an enrolled admin for a code, and refuses a wrong one', async () => {
      const first = await h.flow.start(credentials);
      if (first.kind !== 'enrolment') throw new Error('expected enrolment');
      const { recoveryCodes } = await h.flow.complete(first.challengeToken, totpCodeAt(first.secret, Date.now()));

      const second = await h.flow.start(credentials);
      expect(second.kind).toBe('code');
      await expect(h.flow.complete((second as { challengeToken: string }).challengeToken, '000000')).rejects.toBeInstanceOf(
        InvalidTwoFactorCodeError,
      );

      // A recovery code works, once.
      const token = (second as { challengeToken: string }).challengeToken;
      await expect(h.flow.complete(token, recoveryCodes![0])).resolves.toMatchObject({ accessToken: 'access' });
      await expect(h.flow.complete(token, recoveryCodes![0])).rejects.toBeInstanceOf(InvalidTwoFactorCodeError);
    });

    it('refuses a forged challenge', async () => {
      await expect(h.flow.complete('forged.challenge', '123456')).rejects.toBeInstanceOf(InvalidChallengeError);
    });
  });
});
