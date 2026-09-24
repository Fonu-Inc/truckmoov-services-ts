import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Its own app, so refusals and failed logins elsewhere never trip the IP
// block these sign-ins go through.
describe('Installer portal over HTTP (auth)', () => {
  let app: INestApplication;
  let staffToken: string;
  let installerId: string;
  let installerToken: string;
  let signIn: request.Response;
  const email = 'field.installer@example.com';
  const password = 'Installer123!';
  const previous = { ...process.env };

  const http = () => request(app.getHttpServer());

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
    });
    vi.resetModules();
    const { AppModule } = await import('../../../apps/auth/src/app.module');
    const { INVITE_REPOSITORY } = await import('../../../apps/auth/src/contexts/auth/session');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('auth');
    await app.init();

    const staff = await http().post('/auth/system/login').send({ email: 'superadmin@truckmoov.com', password: 'SuperAdmin123!' });
    staffToken = staff.body.data?.accessToken ?? staff.body.accessToken;
    const created = await http()
      .post('/auth/system/installers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        firstName: 'Field',
        lastName: 'Installer',
        email,
        phoneNumber: '08031234567',
        serviceAreas: ['Lagos'],
        capabilities: ['device_installation'],
      });
    installerId = created.body.data?.id;
    const invite = await moduleRef.get(INVITE_REPOSITORY).findByEmail(email);
    await http().post('/auth/register/invited').send({ inviteToken: invite?.token, fullName: 'Field Installer', password });
    signIn = await http().post('/auth/installer/login').send({ email, password });
    installerToken = signIn.body.data?.accessToken ?? signIn.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
  });

  it('is added by staff, accepts the invite and signs in to the installer portal', () => {
    expect(installerId).toBeTruthy();
    expect(signIn.status).toBe(201);
    expect(installerToken).toBeTruthy();
  });

  it('reaches its own account and capabilities', async () => {
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${installerToken}`);
    const capabilities = await http().get('/auth/capabilities').set('Authorization', `Bearer ${installerToken}`);

    expect(me.status).toBe(200);
    expect(capabilities.body.data).toMatchObject({ portal: 'installer', permissions: [] });
  });

  // The tenant login answers an installer exactly as it answers platform staff.
  it('is refused by the tenant login', async () => {
    const installer = await http().post('/auth/login').send({ email, password });
    const staff = await http().post('/auth/login').send({ email: 'superadmin@truckmoov.com', password: 'SuperAdmin123!' });

    expect(installer.status).toBe(404);
    expect(installer.status).toBe(staff.status);
    expect(installer.body).toEqual(staff.body);
  });

  it('cannot sign in once suspended', async () => {
    const suspended = await http().post(`/auth/system/installers/${installerId}/suspend`).set('Authorization', `Bearer ${staffToken}`);
    const login = await http().post('/auth/installer/login').send({ email, password });

    expect(suspended.status).toBe(201);
    expect(login.status).toBe(404);
    expect(login.body.data?.accessToken ?? login.body.accessToken).toBeUndefined();
  });

  it('is refused on tenant and admin routes as if they were missing', async () => {
    for (const path of ['/auth/profile', '/auth/system/dashboard', '/auth/system/installers']) {
      const res = await http().get(path).set('Authorization', `Bearer ${installerToken}`);
      expect(res.status, path).toBe(404);
    }
  });
});
