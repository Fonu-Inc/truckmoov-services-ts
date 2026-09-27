import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTotpSecret, TOTP_PERIOD_SECONDS, totpCodeAt } from '@shared/crypto';
import { AuthUser } from '../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity';
import { LoginUseCase, type LoginAudience } from '../../../apps/auth/src/contexts/auth/session/application/use-cases/login.use-case';
import { InMemorySessionStore } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { InMemoryTwoFactorRepository } from '../../../apps/auth/src/mikro-two-factor.repository';
import { issueChallengeToken } from '../../../apps/auth/src/two-factor-login';
import {
  InvalidChallengeError,
  LoginCodeRefusedError,
  TwoFactorLogin,
  type LoginStart,
} from '../../../apps/auth/src/two-factor-login.use-case';
import { hashRecoveryCode, InvalidTwoFactorCodeError } from '../../../apps/auth/src/two-factor.use-cases';
import { TwoFactorCooldownError } from '../../../apps/auth/src/two-factor-attempts';

const SECRET = 'challenge-secret';
const PEOPLE: Record<LoginAudience, { id: string; email: string; role: string; tenantId: string }> = {
  system: { id: 'staff-1', email: 'staff@truckmoov.com', role: 'SYSTEM_ADMIN', tenantId: 'system' },
  tenant: { id: 'fleet-1', email: 'owner@fleet.example', role: 'FLEET_ADMIN', tenantId: 't1' },
  installer: { id: 'inst-1', email: 'tunde@example.com', role: 'INSTALLER', tenantId: 'system' },
};
const AUDIENCES = Object.keys(PEOPLE) as LoginAudience[];
const cipher = { encrypt: (s: string) => ({ ciphertext: `enc:${s}` }), decrypt: (c: string) => c.slice(4) };
const password = 'Password123!';

async function build(adminTwoFactorRequired = false) {
  const users = new InMemoryUserRepository();
  for (const person of Object.values(PEOPLE)) await users.save({ ...person, passwordHash: 'x' });
  const identity = {
    verifyCredentials: async (email: string) => {
      const stored = await users.findByEmail(email);
      if (!stored) throw new Error('unknown');
      return AuthUser.create({ id: stored.id, email: stored.email, role: stored.role, tenantId: stored.tenantId });
    },
  };
  let issued = 0;
  const tokens = { issueAccessToken: () => `access-${++issued}`, issueRefreshToken: () => `refresh-${issued}` };
  const login = new LoginUseCase(identity as never, tokens as never, new InMemorySessionStore());
  const enrolments = new InMemoryTwoFactorRepository();
  const config = { adminTwoFactorRequired, auth: { jwtSecret: SECRET } };
  return { flow: new TwoFactorLogin(login, users, enrolments, cipher as never, config as never), users, enrolments };
}

type Harness = Awaited<ReturnType<typeof build>>;

async function enrol(h: Harness, userId: string) {
  const secret = generateTotpSecret();
  const recoveryCodes = ['aaaaa-bbbbb', 'ccccc-ddddd'];
  await h.enrolments.save({
    userId,
    secretCiphertext: `enc:${secret}`,
    confirmedAt: new Date(),
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    lastUsedStep: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { secret, recoveryCodes };
}

function challengeOf(started: LoginStart): string {
  if (started.kind !== 'code') throw new Error(`expected a code challenge, got ${started.kind}`);
  return started.challengeToken;
}

const nextCode = (secret: string) => totpCodeAt(secret, Date.now() + TOTP_PERIOD_SECONDS * 1000);

describe.each(AUDIENCES)('two-factor sign-in on the %s portal', (audience) => {
  const person = PEOPLE[audience];
  const credentials = { email: person.email, password };

  it('opens a session on the password alone for someone not enrolled', async () => {
    const h = await build();
    const started = await h.flow.start(audience, credentials);
    expect(started.kind).toBe('session');
  });

  it('answers an enrolled user with a challenge, never a session', async () => {
    const h = await build();
    await enrol(h, person.id);
    expect((await h.flow.start(audience, credentials)).kind).toBe('code');
  });

  it('finishes with a good code', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));

    const done = await h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()));

    expect(done.session.user).toMatchObject({ id: person.id });
    expect(done.secondFactor).toBe('authenticator');
  });

  it('finishes with a recovery code, which then never works again', async () => {
    const h = await build();
    const { recoveryCodes } = await enrol(h, person.id);

    const first = await h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), recoveryCodes[0]);
    const again = h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), recoveryCodes[0]);

    expect(first.secondFactor).toBe('recovery_code');
    await expect(again).rejects.toBeInstanceOf(InvalidTwoFactorCodeError);
    expect((await h.enrolments.findByUserId(person.id))?.recoveryCodeHashes).toHaveLength(1);
  });

  it('refuses a bad code, naming whose sign-in it was', async () => {
    const h = await build();
    await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));

    const refused = await h.flow.complete(audience, challenge, '000000').catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(LoginCodeRefusedError);
    expect((refused as LoginCodeRefusedError).user.id).toBe(person.id);
  });

  it('refuses an expired challenge', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const audienceLabel = { system: 'admin-login', tenant: 'tenant-login', installer: 'installer-login' }[audience];
    const expired = issueChallengeToken({ userId: person.id, audience: audienceLabel, version: 1 }, SECRET, Date.now() - 10 * 60_000);

    await expect(h.flow.complete(audience, expired, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
  });

  it('refuses a challenge from another portal', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));

    for (const other of AUDIENCES.filter((a) => a !== audience)) {
      await expect(h.flow.complete(other, challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
    }
  });

  it('spends a challenge on use, and refuses a second finish of it', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    await h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()));

    await expect(h.flow.complete(audience, challenge, nextCode(secret))).rejects.toBeInstanceOf(InvalidChallengeError);
  });

  it('lets only one of two simultaneous finishes through', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    const code = totpCodeAt(secret, Date.now());

    const results = await Promise.allSettled([
      h.flow.complete(audience, challenge, code),
      h.flow.complete(audience, challenge, code),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('will not accept the same authenticator code twice', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const code = totpCodeAt(secret, Date.now());
    await h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), code);

    const replay = h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), code);

    await expect(replay).rejects.toBeInstanceOf(InvalidTwoFactorCodeError);
    await expect(
      h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), nextCode(secret)),
    ).resolves.toBeTruthy();
  });

  it('refuses the code step once the account is disabled', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    await h.users.updateAccountStatus(person.id, 'disabled');

    await expect(h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
  });

  it('refuses a challenge issued before two-factor was turned off and on again', async () => {
    const h = await build();
    await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    const { secret } = await enrol(h, person.id);
    await h.enrolments.save({ ...(await h.enrolments.findByUserId(person.id))!, version: 2 });

    await expect(h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
  });

  it('refuses a forged challenge', async () => {
    const h = await build();
    await enrol(h, person.id);
    await expect(h.flow.complete(audience, 'forged.challenge', '123456')).rejects.toBeInstanceOf(InvalidChallengeError);
  });
});

describe('the portal a challenge names', () => {
  // Accounts belong to one portal today; the challenge must not lean on that.
  it('is enforced even for an account every portal would admit', async () => {
    const h = await build();
    const { secret } = await enrol(h, PEOPLE.tenant.id);
    const login = { admits: () => true, issueSession: async () => ({ accessToken: 'a' }) };
    const flow = new TwoFactorLogin(login as never, h.users, h.enrolments, cipher as never, { auth: { jwtSecret: SECRET } } as never);
    const challenge = issueChallengeToken({ userId: PEOPLE.tenant.id, audience: 'tenant-login', version: 1 }, SECRET);

    await expect(flow.complete('installer', challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
    await expect(flow.complete('system', challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
    await expect(flow.complete('tenant', challenge, totpCodeAt(secret, Date.now()))).resolves.toBeTruthy();
  });
});

describe('tenant and installer challenges never enrol', () => {
  it.each(['tenant', 'installer'] as const)('refuses a %s challenge once the enrolment is only pending', async (audience) => {
    const h = await build();
    const { secret } = await enrol(h, PEOPLE[audience].id);
    const challenge = challengeOf(await h.flow.start(audience, { email: PEOPLE[audience].email, password }));
    const pending = await h.enrolments.findByUserId(PEOPLE[audience].id);
    await h.enrolments.save({ ...pending!, confirmedAt: null });

    await expect(h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()))).rejects.toBeInstanceOf(InvalidChallengeError);
  });
});

describe('admin sign-in when the platform requires two-factor', () => {
  const credentials = { email: PEOPLE.system.email, password };

  it('enrols an admin who never set up an authenticator, and hands out recovery codes once', async () => {
    const h = await build(true);
    const started = await h.flow.start('system', credentials);
    if (started.kind !== 'enrolment') throw new Error(`expected enrolment, got ${started.kind}`);

    const done = await h.flow.complete('system', started.challengeToken, totpCodeAt(started.secret, Date.now()));

    expect(done.session.accessToken).toMatch(/^access-/);
    expect(done.session.recoveryCodes).toHaveLength(8);
    expect(done.secondFactor).toBe('enrolment');
  });

  it('never opens a session on the password alone', async () => {
    const h = await build(true);
    expect((await h.flow.start('system', credentials)).kind).not.toBe('session');
  });

  it('asks an enrolled admin for a code', async () => {
    const h = await build(true);
    await enrol(h, PEOPLE.system.id);
    expect((await h.flow.start('system', credentials)).kind).toBe('code');
  });
});

describe.each(AUDIENCES)('the wrong-code cooldown on the %s portal', (audience) => {
  const person = PEOPLE[audience];
  const credentials = { email: person.email, password };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  async function refuseThrice(h: Harness, challenge: string) {
    for (let i = 0; i < 3; i += 1) {
      await expect(h.flow.complete(audience, challenge, '000000')).rejects.toBeInstanceOf(LoginCodeRefusedError);
    }
  }

  it('refuses every code for 60 seconds after three wrong ones, a correct one too', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    await refuseThrice(h, challenge);

    const refused = await h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now())).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(TwoFactorCooldownError);
    expect((refused as TwoFactorCooldownError).retryAfterSeconds).toBe(60);
    expect((refused as Error).message).toBe('Too many wrong codes, try again in 60 seconds');
  });

  it('takes codes again once the cooldown ends, on the same challenge', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    await refuseThrice(h, challenge);

    vi.advanceTimersByTime(45_000);
    await expect(h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()))).rejects.toMatchObject({ retryAfterSeconds: 15 });
    vi.advanceTimersByTime(15_000);

    const done = await h.flow.complete(audience, challenge, totpCodeAt(secret, Date.now()));
    expect(done.session.user).toMatchObject({ id: person.id });
  });

  it('counts from zero again after a cooldown', async () => {
    const h = await build();
    await enrol(h, person.id);
    const challenge = challengeOf(await h.flow.start(audience, credentials));
    await refuseThrice(h, challenge);
    vi.advanceTimersByTime(60_000);

    await refuseThrice(h, challenge);
    await expect(h.flow.complete(audience, challenge, '000000')).rejects.toBeInstanceOf(TwoFactorCooldownError);
  });

  it('starts the count again after a correct code', async () => {
    const h = await build();
    const { secret } = await enrol(h, person.id);
    for (let i = 0; i < 2; i += 1) {
      await expect(h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), '000000')).rejects.toBeInstanceOf(LoginCodeRefusedError);
    }
    await h.flow.complete(audience, challengeOf(await h.flow.start(audience, credentials)), totpCodeAt(secret, Date.now()));

    await refuseThrice(h, challengeOf(await h.flow.start(audience, credentials)));
  });

  it('keeps the count per account', async () => {
    const h = await build();
    await enrol(h, person.id);
    const other = AUDIENCES.find((a) => a !== audience)!;
    const { secret } = await enrol(h, PEOPLE[other].id);
    await refuseThrice(h, challengeOf(await h.flow.start(audience, credentials)));

    const challenge = challengeOf(await h.flow.start(other, { email: PEOPLE[other].email, password }));
    await expect(h.flow.complete(other, challenge, totpCodeAt(secret, Date.now()))).resolves.toBeTruthy();
  });
});

describe('the wrong-code cooldown on an admin\'s first enrolment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('refuses the correct code during the cooldown and takes it after, on the same challenge', async () => {
    const h = await build(true);
    const started = await h.flow.start('system', { email: PEOPLE.system.email, password });
    if (started.kind !== 'enrolment') throw new Error(`expected enrolment, got ${started.kind}`);
    for (let i = 0; i < 3; i += 1) {
      await expect(h.flow.complete('system', started.challengeToken, '000000')).rejects.toBeInstanceOf(LoginCodeRefusedError);
    }

    await expect(h.flow.complete('system', started.challengeToken, totpCodeAt(started.secret, Date.now()))).rejects.toBeInstanceOf(TwoFactorCooldownError);
    vi.advanceTimersByTime(60_000);

    const done = await h.flow.complete('system', started.challengeToken, totpCodeAt(started.secret, Date.now()));
    expect(done.secondFactor).toBe('enrolment');
  });
});
