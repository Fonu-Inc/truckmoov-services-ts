import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TOTP_PERIOD_SECONDS, totpCodeAt } from '@shared/crypto';

// Its own app, and every request names its own client address, so the failed
// codes these tests send never trip the IP block for another test.
describe('Two-factor sign-in over HTTP (auth)', () => {
  let app: INestApplication;
  let jwtSecret: string;
  let enrolments: import('../../../apps/auth/src/two-factor.repository').TwoFactorRepository;
  let issueChallengeToken: typeof import('../../../apps/auth/src/two-factor-login').issueChallengeToken;
  const previous = { ...process.env };
  let lastIp = 0;

  const freshIp = () => `10.20.0.${++lastIp}`;
  const post = (path: string, ip = freshIp()) => request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip);
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`);
  const codeAt = (secret: string, stepsFromNow: number) => totpCodeAt(secret, Date.now() + stepsFromNow * TOTP_PERIOD_SECONDS * 1000);

  const portals = {
    tenant: { email: 'owner@twofactor.example', password: 'Tenant123!', login: '/auth/login', code: '/auth/login/two-factor' },
    installer: {
      email: 'installer@twofactor.example',
      password: 'Installer123!',
      login: '/auth/installer/login',
      code: '/auth/installer/login/two-factor',
    },
  };
  type Portal = keyof typeof portals;
  const enrolled = {} as Record<Portal, { token: string; userId: string; secret: string; recoveryCodes: string[] }>;

  async function signIn(portal: Portal, ip?: string) {
    const { email, password, login } = portals[portal];
    return post(login, ip).send({ email, password });
  }

  async function challenge(portal: Portal): Promise<string> {
    const started = await signIn(portal);
    expect(started.body).toEqual({ twoFactorRequired: true, step: 'code', challengeToken: expect.any(String) });
    return started.body.challengeToken;
  }

  async function enrol(portal: Portal) {
    const token = (await signIn(portal)).body.accessToken;
    const begun = await post('/auth/two-factor/enrol').set('Authorization', `Bearer ${token}`);
    const secret = begun.body.data.secret;
    const confirmed = await post('/auth/two-factor/enrol/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: codeAt(secret, -1) });
    expect(confirmed.status).toBe(201);
    const userId = (await get('/auth/me', token)).body.id as string;
    return { token, userId, secret, recoveryCodes: confirmed.body.data.recoveryCodes as string[] };
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      PERSISTENCE_BACKEND: 'in-memory',
      MAIL_TRANSPORT: 'null',
      SMS_TRANSPORT: 'null',
      SUPERADMIN_EMAIL: 'superadmin@truckmoov.com',
      SUPERADMIN_PASSWORD: 'SuperAdmin123!',
      SUPERADMIN_FULL_NAME: 'Truckmoov Super Admin',
      SUPERADMIN_TENANT_ID: 'system',
      LOGIN_RATE_LIMIT_BURST: '1000',
      PORTAL_ENFORCEMENT: 'enforce',
      SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    });
    vi.resetModules();
    const { AppModule } = await import('../../../apps/auth/src/app.module');
    const { INVITE_REPOSITORY, PASSWORD_HASHER, USER_REPOSITORY } = await import('../../../apps/auth/src/contexts/auth/session');
    const { AppConfigService } = await import('@shared/config');
    ({ issueChallengeToken } = await import('../../../apps/auth/src/two-factor-login'));
    const { TWO_FACTOR_REPOSITORY } = await import('../../../apps/auth/src/two-factor.repository');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.setGlobalPrefix('auth');
    await app.init();
    jwtSecret = moduleRef.get(AppConfigService).auth.jwtSecret;
    enrolments = moduleRef.get(TWO_FACTOR_REPOSITORY);

    await moduleRef.get(USER_REPOSITORY).save({
      id: 'tenant-owner',
      email: portals.tenant.email,
      passwordHash: await moduleRef.get(PASSWORD_HASHER).hash(portals.tenant.password),
      role: 'ENTERPRISE_ADMIN',
      tenantId: 'tenant-2fa',
      emailVerificationToken: null,
    });

    const staff = await post('/auth/system/login').send({ email: 'superadmin@truckmoov.com', password: 'SuperAdmin123!' });
    await post('/auth/system/installers')
      .set('Authorization', `Bearer ${staff.body.accessToken}`)
      .send({
        firstName: 'Two',
        lastName: 'Factor',
        email: portals.installer.email,
        phoneNumber: '08031234568',
        state: 'Lagos',
        city: 'Ikeja',
        serviceAreas: ['Lagos'],
        capabilities: ['device_installation'],
      });
    const invite = await moduleRef.get(INVITE_REPOSITORY).findByEmail(portals.installer.email);
    await post('/auth/register/invited').send({ inviteToken: invite?.token, fullName: 'Two Factor', password: portals.installer.password });
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
  });

  describe.each(['tenant', 'installer'] as const)('on the %s portal', (portal) => {
    it('signs in with tokens while two-factor is off', async () => {
      const res = await signIn(portal);
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.twoFactorRequired).toBeUndefined();
    });

    it('turns two-factor on from its own portal, and then answers the password with a challenge', async () => {
      enrolled[portal] = await enrol(portal);
      const status = await get('/auth/two-factor', enrolled[portal].token);

      expect(enrolled[portal].recoveryCodes).toHaveLength(8);
      expect(status.body.data).toMatchObject({ enrolled: true, recoveryCodesRemaining: 8 });
      await challenge(portal);
    });

    it('finishes with a good code', async () => {
      const res = await post(portals[portal].code).send({ challengeToken: await challenge(portal), code: codeAt(enrolled[portal].secret, 0) });
      const me = await get('/auth/me', res.body.accessToken);

      expect(res.status).toBe(201);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(portals[portal].email);
    });

    it('finishes with a recovery code once, and refuses it the second time', async () => {
      const [recovery] = enrolled[portal].recoveryCodes;
      const first = await post(portals[portal].code).send({ challengeToken: await challenge(portal), code: recovery });
      const second = await post(portals[portal].code).send({ challengeToken: await challenge(portal), code: recovery });

      expect(first.status).toBe(201);
      expect(first.body.accessToken).toBeTruthy();
      expect(second.status).toBe(401);
      expect(second.body.message).toBe('That code is not valid');
    });

    it('refuses a bad code, and counts it toward the IP block', async () => {
      await enrolments.clearCodeAttempts(enrolled[portal].userId);
      const ip = freshIp();
      const wrong = codeAt(enrolled[portal].secret, 20);
      const refusals = [];
      for (let i = 0; i < 3; i += 1) {
        refusals.push(await post(portals[portal].code, ip).send({ challengeToken: await challenge(portal), code: wrong }));
      }
      const blocked = await signIn(portal, ip);

      expect(refusals.map((r) => r.status)).toEqual([401, 401, 401]);
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toBe('This IP address is blocked');
      // Three wrong codes also cooled the account down; the tests after this one sign in.
      await enrolments.clearCodeAttempts(enrolled[portal].userId);
    });

    it('cools the account down after three wrong codes, without spending the challenge', async () => {
      const { userId, secret } = enrolled[portal];
      const token = await challenge(portal);
      for (let i = 0; i < 3; i += 1) {
        expect((await post(portals[portal].code).send({ challengeToken: token, code: codeAt(secret, 20) })).status).toBe(401);
      }

      const cooling = await post(portals[portal].code).send({ challengeToken: token, code: codeAt(secret, 0) });
      expect(cooling.status).toBe(429);
      expect(cooling.body).toEqual({
        message: expect.stringMatching(/^Too many wrong codes, try again in \d+ seconds$/),
        retryAfterSeconds: expect.any(Number),
      });

      await enrolments.clearCodeAttempts(userId);
      const code = enrolled[portal].recoveryCodes[2];
      expect((await post(portals[portal].code).send({ challengeToken: token, code })).status).toBe(201);
    });

    it('refuses an expired challenge that is otherwise current', async () => {
      const { userId } = enrolled[portal];
      const version = (await enrolments.findByUserId(userId))?.version ?? -1;
      const expired = issueChallengeToken({ userId, audience: `${portal}-login`, version }, jwtSecret, Date.now() - 10 * 60_000);

      const res = await post(portals[portal].code).send({ challengeToken: expired, code: codeAt(enrolled[portal].secret, 0) });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('This sign-in has expired; start again');
    });

    it('refuses its challenge at every other portal\'s code step', async () => {
      const token = await challenge(portal);
      const others = ['/auth/login/two-factor', '/auth/installer/login/two-factor', '/auth/system/login/two-factor'].filter(
        (path) => path !== portals[portal].code,
      );

      for (const path of others) {
        const res = await post(path).send({ challengeToken: token, code: enrolled[portal].recoveryCodes[1] });
        expect(res.status).toBe(401);
      }
      expect((await post(portals[portal].code).send({ challengeToken: token, code: enrolled[portal].recoveryCodes[1] })).status).toBe(201);
    });
  });

  it('cools the account down on the turn-off step too', async () => {
    const { token, userId } = enrolled.installer;
    const disable = (code: string) => post('/auth/two-factor/disable').set('Authorization', `Bearer ${token}`).send({ code });
    for (let i = 0; i < 3; i += 1) expect((await disable('000000')).status).toBe(400);

    const cooling = await disable(codeAt(enrolled.installer.secret, 0));

    expect(cooling.status).toBe(429);
    expect(cooling.body.retryAfterSeconds).toEqual(expect.any(Number));
    await enrolments.clearCodeAttempts(userId);
  });

  it('turns two-factor off from the installer portal with a current code', async () => {
    const { token } = enrolled.installer;
    const off = await post('/auth/two-factor/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: codeAt(enrolled.installer.secret, 0) });
    const after = await signIn('installer');

    expect(off.status).toBe(201);
    expect(after.body.accessToken).toBeTruthy();
  });
});
