import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ServiceCaller } from '@shared/identity';

describe('Portal enforcement over HTTP (auth)', () => {
  let app: INestApplication;
  let staffToken: string;
  const previous = { ...process.env };

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
      SERVICE_AUTH_DEV_SECRET: 'dev-secret',
    });
    vi.resetModules();
    const { AppModule } = await import('../../../apps/auth/src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('auth');
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({ email: 'superadmin@truckmoov.com', password: 'SuperAdmin123!' });
    staffToken = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
  });

  it('keeps the admin login public and serves the admin portal', async () => {
    expect(staffToken).toBeTruthy();
    const res = await request(app.getHttpServer()).get('/auth/system/dashboard').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  // Byte-for-byte what the router says about a path it does not know, so the
  // refusal gives nothing away.
  it('answers an admin token on a tenant route exactly like a missing route', async () => {
    const refused = await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${staffToken}`);
    const missing = await request(app.getHttpServer()).get('/auth/profil').set('Authorization', `Bearer ${staffToken}`);

    expect(refused.status).toBe(404);
    expect(refused.body).toEqual({ ...missing.body, message: 'Cannot GET /auth/profile' });
    expect(refused.headers['content-type']).toBe(missing.headers['content-type']);
  });

  it('hides a system route from an anonymous caller', async () => {
    const res = await request(app.getHttpServer()).get('/auth/system/dashboard');
    expect(res.status).toBe(404);
  });

  it('refuses another service-only route to a user token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/internal/usage/entitlements').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });

  it('refuses the bundle catalogue service route to a user token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/internal/bundle-catalog').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });
  describe('notification recipients', () => {
    const as = (caller: string, tenantId: string) =>
      new ServiceCaller({ self: caller, tokenDir: '/nonexistent', devSecret: 'dev-secret', legacySecret: '' }).headers('auth', { tenantId })!;

    it('refuses a user token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/internal/notification-recipients').set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(404);
    });

    it('refuses a service other than notification', async () => {
      const res = await request(app.getHttpServer()).get('/auth/internal/notification-recipients').set(as('dispatch', 'system'));
      expect(res.status).toBe(401);
    });

    it('lists the acting tenant\'s users to the notification service', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/internal/notification-recipients')
        .query({ roles: 'PLATFORM_ADMIN,SUPER_ADMIN' })
        .set(as('notification', 'system'));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const recipient of res.body.data) {
        expect(Object.keys(recipient).sort()).toEqual(['id', 'organizationType', 'preferences', 'role']);
        expect(['PLATFORM_ADMIN', 'SUPER_ADMIN']).toContain(recipient.role);
        expect(recipient.preferences.pushAlerts).toBe(true);
      }
    });

    it('lists nobody for a tenant without users', async () => {
      const res = await request(app.getHttpServer()).get('/auth/internal/notification-recipients').set(as('notification', 'tenant-nobody'));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});
