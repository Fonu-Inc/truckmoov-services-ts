import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
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
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
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
        state: 'Lagos',
        city: 'Ikeja',
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
    expect(dashboard.body.data.counters).toEqual({ total: 0, completed: 0, pending: 0, successRate: 0 });
    expect(jobs.body.data).toMatchObject({ items: [], total: 0, counters: { total: 0, scheduled: 0, issueReported: 0 } });
    expect(missing.status).toBe(404);
    expect(edited.status).toBe(200);
    expect(edited.body.data.personal).toMatchObject({ firstName: 'Tunde', city: 'Ikeja', photoUrl: null });
    expect(me.body.fullName).toBe('Tunde Installer');
  });

  it('exports the history as CSV ahead of the job route, and refuses a bad time zone', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const csv = await http().get('/auth/installer/jobs/export?timezone=Europe/London').set(auth);
    const refused = await http().get('/auth/installer/jobs/export?timezone=Mars/Olympus').set(auth);

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toContain('installation-history.csv');
    expect(csv.text).toBe('Company Name,Job Number,Site Contact Name,Contact Phone,Installation Location,Devices,Vehicles,Completion Date,Completion Time,Status');
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('timezone must be an IANA time zone, such as Africa/Lagos');
  });

  it('serves the job options, and answers work on a missing job with 404', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const options = await http().get('/auth/installer/options').set(auth);
    const accept = await http().post('/auth/installer/jobs/nope/accept').set(auth);
    const tick = await http().put('/auth/installer/jobs/nope/checklist/install_device').set(auth).send({ checked: true });
    const notes = await http().patch('/auth/installer/jobs/nope/notes').set(auth).send({ notes: 'x'.repeat(2001) });
    const reject = await http().post('/auth/installer/jobs/nope/reject').set(auth).send({ reason: 'Too far from my route' });
    const vague = await http().post('/auth/installer/jobs/nope/reject').set(auth).send({ reason: '  no ' });

    expect(options.status).toBe(200);
    expect(options.body.data.evidenceCategories).toEqual([{ key: 'device_installation', label: 'Device installation' }]);
    expect(accept.status).toBe(404);
    expect(tick.status).toBe(404);
    expect(notes.status).toBe(400);
    expect(reject.status).toBe(404);
    expect(vague.status).toBe(400);
  });

  it('completes a device request staff priced, approved and assigned to it, and nobody else\'s', async () => {
    const { LICENCE_PERIOD_REPOSITORY, RENEWAL_FACTS_READER } = await import('@auth/onboarding/domain/licence-period.repository');
    app.get(LICENCE_PERIOD_REPOSITORY).add({
      tenantId: 'tenant-001', applicationId: 'app-tenant-001', planCode: 'm2m_standard', deviceCount: 1,
      periodStart: '2026-01-01', periodEnd: '2026-12-31', origin: 'purchase',
    });
    app.get(RENEWAL_FACTS_READER).byTenant.set('tenant-001', {
      applicationPlanCode: 'm2m_standard', customerName: 'Dangote Logistics', customerType: 'enterprise',
      billingEmail: null, adminEmail: null, fleetDeviceCount: 0, hasUser: true, terminated: false,
    });
    const staff = { Authorization: `Bearer ${staffToken}` };
    const installer = { Authorization: `Bearer ${installerToken}` };
    const platform = (path: string) => http().patch(`/auth/system/support/device-setup/dsr-001/${path}`).set(staff);

    const approved = await platform('approve').send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('ready_for_installation');
    expect(approved.body.data.charges).toMatchObject({ currency: 'NGN', planCode: 'm2m_standard', totalNgn: 92_000 });
    expect(approved.body.data.timeline.map((t: { status: string }) => t.status)).toEqual([
      'under_review', 'awaiting_payment', 'ready_for_installation',
    ]);

    expect((await platform('assign').send({})).status).toBe(400);
    expect((await platform('assign').send({ installerId: 'nobody' })).status).toBe(404);
    const assigned = await platform('assign').send({ installerId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data).toMatchObject({ status: 'installation_in_progress', assignedTo: installerId });

    const mine = await http().get('/auth/installer/device-requests').set(installer);
    expect(mine.body.data.map((r: { id: string }) => r.id)).toEqual(['dsr-001']);
    expect(mine.body.data[0]).not.toHaveProperty('charges');

    const someoneElses = await http().post('/auth/installer/device-requests/dsr-002/complete').set(installer);
    expect(someoneElses.status).toBe(404);

    const completed = await http().post('/auth/installer/device-requests/dsr-001/complete').set(installer);
    expect(completed.status).toBe(201);
    expect(completed.body).toMatchObject({ status: true, message: 'Device request completed', data: { status: 'completed' } });

    const again = await http().post('/auth/installer/device-requests/dsr-001/complete').set(installer);
    expect(again.status).toBe(409);
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

  it('reads and changes its settings: profile without capabilities, display, work and notification preferences', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const profile = await http().get('/auth/installer/profile').set(auth);
    const display = await http().patch('/auth/installer/preferences/display').set(auth).send({ timezone: 'Europe/London' });
    const badZone = await http().patch('/auth/installer/preferences/display').set(auth).send({ timezone: 'Mars/Olympus' });
    const work = await http().patch('/auth/installer/preferences/work').set(auth).send({ availability: 'unavailable', preferredPeriods: 'weekdays' });
    const badHours = await http().patch('/auth/installer/preferences/work').set(auth).send({ workingHours: { start: '18:00', end: '08:00' } });
    const toggles = await http().patch('/auth/installer/preferences/notifications').set(auth).send({ inPlatformAlerts: false });
    const pool = await http().get(`/auth/system/installers/${installerId}`).set('Authorization', `Bearer ${staffToken}`);

    expect(profile.status).toBe(200);
    expect(profile.body.data.record).toEqual({ code: expect.any(String), status: 'active', serviceAreas: ['Lagos'], createdAt: expect.any(String) });
    expect(display.body.data).toEqual({ timezone: 'Europe/London', defaultTimeRange: 'last_7_days' });
    expect(badZone.status).toBe(400);
    expect(work.body.data).toEqual({
      availability: 'unavailable', workingHours: { start: '08:00', end: '18:00' }, preferredPeriods: 'weekdays', serviceAreas: ['Lagos'],
    });
    expect(badHours.status).toBe(400);
    expect(toggles.body.data).toMatchObject({ inPlatformAlerts: false, emailAlerts: true, supportTicketUpdates: true });
    expect(pool.body.data.availability).toBe('unavailable');
  });

  it('changes its password: a wrong current one answers 401 like the system route, a right one returns a new session', async () => {
    const auth = { Authorization: `Bearer ${installerToken}` };
    const wrong = await http().post('/auth/installer/password').set(auth).send({ currentPassword: 'NotMine123!', newPassword: 'Installer456!' });
    const changed = await http().post('/auth/installer/password').set(auth).send({ currentPassword: password, newPassword: 'Installer456!' });
    installerToken = changed.body.data?.accessToken ?? installerToken;
    const back = await http()
      .post('/auth/installer/password')
      .set('Authorization', `Bearer ${installerToken}`)
      .send({ currentPassword: 'Installer456!', newPassword: password });
    installerToken = back.body.data?.accessToken ?? installerToken;

    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ status: false, statusCode: 401, message: 'Invalid credentials', error: 'Unauthorized' });
    expect(changed.status).toBe(201);
    expect(changed.body.data).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { role: 'INSTALLER' } });
    expect(back.status).toBe(201);
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
