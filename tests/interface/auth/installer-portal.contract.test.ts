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

  it('reads its own dashboard, jobs and profile, and a missing job answers 404', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const dashboard = await http().get('/auth/installer/dashboard').set(auth);
    const jobs = await http().get('/auth/installer/jobs?scope=history').set(auth);
    const missing = await http().get('/auth/installer/jobs/nope').set(auth);
    const edited = await http().patch('/auth/installer/profile').set(auth).send({ firstName: 'Tunde', city: 'Ikeja' });
    const me = await http().get('/auth/me').set(auth);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.counters).toMatchObject({ newlyAssigned: 0, completed: 0 });
    expect(jobs.body.data).toMatchObject({ items: [], total: 0, countsByStatus: { all: 0 } });
    expect(missing.status).toBe(404);
    expect(edited.status).toBe(200);
    expect(edited.body.data.personal).toMatchObject({ firstName: 'Tunde', city: 'Ikeja', photoUrl: null });
    expect(me.body.fullName).toBe('Tunde Installer');
  });

  it('serves the job options, and answers work on a missing job with 404', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const options = await http().get('/auth/installer/options').set(auth);
    const accept = await http().post('/auth/installer/jobs/nope/accept').set(auth);
    const tick = await http().put('/auth/installer/jobs/nope/checklist/install_device').set(auth).send({ checked: true });
    const notes = await http().patch('/auth/installer/jobs/nope/notes').set(auth).send({ notes: 'x'.repeat(2001) });

    expect(options.status).toBe(200);
    expect(options.body.data.evidenceCategories).toEqual([{ key: 'device_installation', label: 'Device installation' }]);
    expect(accept.status).toBe(404);
    expect(tick.status).toBe(404);
    expect(notes.status).toBe(400);
  });

  it('lists installation orders for platform staff', async () => {
    const staff = await http().get('/auth/system/installation-orders').set('Authorization', `Bearer ${staffToken}`);

    expect(staff.status).toBe(200);
    expect(staff.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('raises and reads its own support ticket, which the installation desk sees', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const staff = { Authorization: `Bearer ${staffToken}` };
    const raised = await http().post('/auth/installer/support/tickets').set(auth).send({
      category: 'configuration_setup',
      issueCode: 'commands_rejected',
      priority: 'medium',
      description: 'Commands time out',
      callbackPhone: '+234 803 221 4478',
    });
    const refused = await http().post('/auth/installer/support/tickets').set(auth).send({
      category: 'configuration_setup', priority: 'medium', description: 'x', callbackPhone: '08032214478',
    });
    const list = await http().get('/auth/installer/support/tickets?search=commands').set(auth);
    const missing = await http().get('/auth/installer/support/tickets/nope').set(auth);
    const options = await http().get('/auth/installer/options').set(auth);
    const desk = await http().get('/auth/system/support/tickets?reporterType=installer').set(staff);
    const badFilter = await http().get('/auth/system/support/tickets?reporterType=robot').set(staff);

    expect(raised.status).toBe(201);
    expect(raised.body.data).toMatchObject({ title: 'Configuration & Setup — Configuration commands are rejected by the device', status: 'open' });
    expect(raised.body.data.displayId).toMatch(/^#tkt-\d+$/);
    expect(refused.status).toBe(400);
    expect(list.body.data).toMatchObject({ counts: { total: 1, open: 1 }, total: 1 });
    expect(missing.status).toBe(404);
    expect(options.body.data.supportCategories).toHaveLength(6);
    expect(options.body.data.jobIssueTypes).toHaveLength(6);
    expect(options.body.data.fieldTips).toHaveLength(4);
    expect(desk.status).toBe(200);
    expect(desk.body.data.tickets).toEqual([
      expect.objectContaining({ id: raised.body.data.id, reporterType: 'installer', reporterName: 'Tunde Installer' }),
    ]);
    expect(badFilter.status).toBe(400);
  });

  it('answers issue reports and admin exception work on a missing job with 404', async () => {
    const issue = await http()
      .post('/auth/installer/jobs/nope/issues')
      .set('Authorization', `Bearer ${installerToken}`)
      .field('issueType', 'job_scheduling')
      .field('description', 'Customer away');
    const staff = { Authorization: `Bearer ${staffToken}` };
    const resolve = await http().post('/auth/system/installation-orders/nope/resolve-issue').set(staff).send({ outcome: 'resume' });
    const badOutcome = await http().post('/auth/system/installation-orders/nope/resolve-issue').set(staff).send({ outcome: 'ignore' });
    const edit = await http().patch('/auth/system/installation-orders/nope').set(staff).send({ city: 'Yaba' });

    expect(issue.status).toBe(404);
    expect(resolve.status).toBe(404);
    expect(badOutcome.status).toBe(400);
    expect(edit.status).toBe(404);
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
