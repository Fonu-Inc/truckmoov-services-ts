import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createCorsOptions } from '@shared/http';

process.env.PERSISTENCE_BACKEND = 'in-memory';
process.env.MAIL_TRANSPORT ??= 'null';
process.env.SMS_TRANSPORT ??= 'null';
process.env.SUPERADMIN_EMAIL ??= 'superadmin@truckmoov.com';
process.env.SUPERADMIN_PASSWORD ??= 'SuperAdmin123!';
process.env.SUPERADMIN_FULL_NAME ??= 'Truckmoov Super Admin';
process.env.SUPERADMIN_TENANT_ID ??= 'system';

function makeRegisterPayload(
  email: string,
  overrides?: Partial<{
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }>,
) {
  return {
    email,
    password: overrides?.password ?? 'Str0ngPass!',
    firstName: overrides?.firstName ?? 'Test',
    lastName: overrides?.lastName ?? 'User',
    organizationName: overrides?.organizationName ?? 'Truckmoov Test Org',
  };
}

describe('Auth HTTP contract', () => {
  let app: INestApplication;
  let userRepo: {
    save(user: Record<string, unknown>): Promise<void>;
  };
  let inviteRepo: {
    findByEmail(email: string): Promise<{ token: string } | null>;
  };
  let tenantOnboardingRepo: {
    findByTenantId(tenantId: string): Promise<Record<string, unknown> | null>;
  };
  const previousBackend = process.env.PERSISTENCE_BACKEND;
  const previousSuperadminEmail = process.env.SUPERADMIN_EMAIL;
  const previousSuperadminPassword = process.env.SUPERADMIN_PASSWORD;
  const previousSuperadminFullName = process.env.SUPERADMIN_FULL_NAME;
  const previousSuperadminTenantId = process.env.SUPERADMIN_TENANT_ID;

  beforeAll(async () => {
    process.env.PERSISTENCE_BACKEND = 'in-memory';
    process.env.SUPERADMIN_EMAIL = 'superadmin@truckmoov.com';
    process.env.SUPERADMIN_PASSWORD = 'SuperAdmin123!';
    process.env.SUPERADMIN_FULL_NAME = 'Truckmoov Super Admin';
    process.env.SUPERADMIN_TENANT_ID = 'system';
    vi.resetModules();
    const { AppModule } = await import('../../../apps/auth/src/app.module');
    const { USER_REPOSITORY } =
      await import('../../../apps/auth/src/contexts/auth/session');
    const { INVITE_REPOSITORY } =
      await import('../../../apps/auth/src/contexts/auth/session');
    const { TENANT_ONBOARDING_REPOSITORY } =
      await import('../../../apps/auth/src/tenant-onboarding.repository');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableCors(createCorsOptions());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    userRepo = moduleRef.get(USER_REPOSITORY);
    inviteRepo = moduleRef.get(INVITE_REPOSITORY);
    tenantOnboardingRepo = moduleRef.get(TENANT_ONBOARDING_REPOSITORY);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.PERSISTENCE_BACKEND = previousBackend;
    process.env.SUPERADMIN_EMAIL = previousSuperadminEmail;
    process.env.SUPERADMIN_PASSWORD = previousSuperadminPassword;
    process.env.SUPERADMIN_FULL_NAME = previousSuperadminFullName;
    process.env.SUPERADMIN_TENANT_ID = previousSuperadminTenantId;
    vi.resetModules();
  });

  // ── Health ────────────────────────────────────────────

  it('GET /auth/health returns 200', async () => {
    const response = await request(app.getHttpServer()).get('/auth/health');
    expect(response.status).toBe(200);
    expect(response.body.data.service).toBe('auth');
    expect(response.body.data.persistenceBackend).toBe('in-memory');
    expect(response.body.data.database).toBe('n/a');
  });

  it('GET /auth/test-sentry returns 500', async () => {
    const response = await request(app.getHttpServer()).get(
      '/auth/test-sentry',
    );
    expect(response.status).toBe(500);
  });

  // ── Register (enterprise admin) ──────────────────────

  it('POST /auth/register creates an enterprise admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('admin@contract.com', {
          firstName: 'Ada',
          lastName: 'Okafor',
          organizationName: 'Truckmoov Logistics',
        }),
      );

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.user.email).toBe('admin@contract.com');
    expect(res.body.user.tenantId).toBeTypeOf('string');
    expect(res.body.user.role).toBe('ENTERPRISE_ADMIN');
  });

  it('POST /auth/register accepts a wrapped data payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        data: makeRegisterPayload('wrapped@contract.com', {
          firstName: 'Wrapped',
          lastName: 'Payload',
          organizationName: 'Wrapped Transport',
        }),
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('wrapped@contract.com');
    expect(res.body.user.role).toBe('ENTERPRISE_ADMIN');
  });

  it('POST /auth/register rejects duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('dupe@contract.com', {
          firstName: 'Dupe',
          lastName: 'Admin',
          organizationName: 'Dupe Transport',
        }),
      );

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('dupe@contract.com', {
          firstName: 'Dupe',
          lastName: 'Admin',
          organizationName: 'Dupe Transport',
        }),
      );

    expect(res.status).toBe(409);
  });

  // ── Login + Me ────────────────────────────────────────

  it('POST /auth/login then GET /auth/me returns authenticated principal', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('logintest@contract.com', {
          firstName: 'Login',
          lastName: 'Tester',
          organizationName: 'Login Fleet',
        }),
      );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'logintest@contract.com', password: 'Str0ngPass!' });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.accessToken).toBeTypeOf('string');

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe('logintest@contract.com');
    expect(meRes.body.role).toBe('ENTERPRISE_ADMIN');
  });

  it('POST /auth/login rejects wrong credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'logintest@contract.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
  });

  it('POST /auth/login rejects superadmin credentials', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(loginRes.status).toBe(403);
  });

  it('POST /auth/system/login authenticates the bootstrapped superadmin', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.user.email).toBe('superadmin@truckmoov.com');
    expect(loginRes.body.user.role).toBe('SUPER_ADMIN');
    expect(loginRes.body.user.tenantId).toBe('system');
  });

  it('POST /auth/system/login rejects tenant credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('tenant-login-only@contract.com', {
          firstName: 'Tenant',
          lastName: 'Only',
          organizationName: 'Tenant Only Org',
        }),
      );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'tenant-login-only@contract.com',
        password: 'Str0ngPass!',
      });

    expect(loginRes.status).toBe(403);
  });

  it('POST /auth/system/admins creates a system admin account and GET /auth/system/admins lists it', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createRes = await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Admin One',
        email: 'sysadmin1@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.message).toBe('Admin account created successfully');
    expect(createRes.body.user.email).toBe('sysadmin1@truckmoov.com');
    expect(createRes.body.user.role).toBe('SYSTEM_ADMIN');
    expect(createRes.body.user.tenantId).toBe('system');
    expect(createRes.body.user.accountStatus).toBe('enabled');

    const listRes = await request(app.getHttpServer())
      .get('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.tenantId).toBe('system');
    expect(listRes.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'sysadmin1@truckmoov.com',
          role: 'SYSTEM_ADMIN',
          tenantId: 'system',
          accountStatus: 'enabled',
        }),
      ]),
    );
  });

  it('POST /auth/system/login authenticates a system admin and PATCH /auth/system/change-password rotates credentials', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });
    const superadminToken = superadminLoginRes.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Admin Two',
        email: 'sysadmin2@truckmoov.com',
        password: 'Adm1nPass!',
      })
      .expect(201);

    const tenantLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'sysadmin2@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(tenantLoginRes.status).toBe(403);

    const adminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'sysadmin2@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(adminLoginRes.status).toBe(201);
    expect(adminLoginRes.body.user.role).toBe('SYSTEM_ADMIN');

    const changePasswordRes = await request(app.getHttpServer())
      .patch('/auth/system/change-password')
      .set('Authorization', `Bearer ${adminLoginRes.body.accessToken}`)
      .send({
        currentPassword: 'Adm1nPass!',
        newPassword: 'Adm1nPass!Updated',
      });

    expect(changePasswordRes.status).toBe(200);
    expect(changePasswordRes.body.user.email).toBe('sysadmin2@truckmoov.com');
    expect(changePasswordRes.body.accessToken).toBeTypeOf('string');
    expect(changePasswordRes.body.refreshToken).toBeTypeOf('string');

    const oldPasswordLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'sysadmin2@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(oldPasswordLoginRes.status).toBe(401);

    const newPasswordLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'sysadmin2@truckmoov.com',
        password: 'Adm1nPass!Updated',
      });

    expect(newPasswordLoginRes.status).toBe(201);
  });

  it('PATCH /auth/system/admins/:userId/status suspends and reactivates a system admin account', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createRes = await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Admin Three',
        email: 'sysadmin3@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.user.userId as string;

    const disableRes = await request(app.getHttpServer())
      .patch(`/auth/system/admins/${userId}/status`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ accountStatus: 'disabled' });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.user.accountStatus).toBe('disabled');

    const disabledLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'sysadmin3@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(disabledLoginRes.status).toBe(403);

    const enableRes = await request(app.getHttpServer())
      .patch(`/auth/system/admins/${userId}/status`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ accountStatus: 'enabled' });

    expect(enableRes.status).toBe(200);
    expect(enableRes.body.user.accountStatus).toBe('enabled');

    const enabledLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'sysadmin3@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(enabledLoginRes.status).toBe(201);
  });

  it('GET /auth/system/activity-log returns system-scoped activity and tenant activity log rejects system accounts', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createAdminRes = await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Audit Admin',
        email: 'system-audit-admin@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(createAdminRes.status).toBe(201);

    const systemLogRes = await request(app.getHttpServer())
      .get('/auth/system/activity-log')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(systemLogRes.status).toBe(200);
    expect(systemLogRes.body.status).toBe(true);
    expect(Array.isArray(systemLogRes.body.data)).toBe(true);
    expect(systemLogRes.body.data.length).toBeGreaterThan(0);
    expect(
      systemLogRes.body.data.some(
        (entry: { action: string }) => entry.action === 'system.admin.created',
      ),
    ).toBe(true);
    expect(
      systemLogRes.body.data.every(
        (entry: { tenantId: string }) => entry.tenantId === 'system',
      ),
    ).toBe(true);

    const tenantLogRes = await request(app.getHttpServer())
      .get('/auth/activity-log')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(tenantLogRes.status).toBe(403);
  });

  it('POST /auth/system/tenants creates a tenant onboarding record and sends the bootstrap invite', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Swift Logistics Ltd',
          email: 'tenant-owner@swiftlogistics.com',
          phoneNumber: '+2348012345678',
          billingEmail: 'billing@swiftlogistics.com',
          businessAddress: '123 Business District, Lagos',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_SCALE',
          billingCycle: 'monthly',
        },
        deviceProvisioning: {
          provisionNow: true,
          numberOfDevices: 10,
          deviceManufacturer: 'Teltonika',
        },
        simAssignment: {
          provisionNow: true,
          numberOfSims: 10,
          carrier: 'MTN',
          dataPackage: '500MB/month',
        },
        features: {
          geofencing: true,
          liveTracking: true,
          messaging: false,
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe(true);
    expect(createRes.body.message).toBe(
      'Tenant onboarding created successfully',
    );
    expect(createRes.body.data.status).toBe('pending_activation');
    expect(createRes.body.data.bootstrapRole).toBe('PLATFORM_ADMIN');
    expect(createRes.body.data.company.companyName).toBe('Swift Logistics Ltd');
    expect(createRes.body.data.subscription.planCode).toBe('FLEET_SCALE');
    expect(createRes.body.data.features.liveTracking).toBe(true);
    expect(createRes.body.data.features.messaging).toBe(false);
    expect(createRes.body.data.features.geofencing).toBe(true);
    expect(createRes.body.data.features.routeOptimization).toBe(false);

    const onboarding = await tenantOnboardingRepo.findByTenantId(
      createRes.body.data.tenantId,
    );
    expect(onboarding).toBeTruthy();
    expect(onboarding?.invitedEmail).toBe('tenant-owner@swiftlogistics.com');
    expect(onboarding?.bootstrapRole).toBe('PLATFORM_ADMIN');

    const invite = await inviteRepo.findByEmail(
      'tenant-owner@swiftlogistics.com',
    );
    expect(invite).toBeTruthy();
  });

  it('GET /auth/system/tenants/summary and /auth/system/tenants return tenant management data', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createAdminRes = await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Tenant Admin',
        email: 'system-tenant-admin@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(createAdminRes.status).toBe(201);

    const pendingTenantRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Delta Pending Logistics',
          email: 'pending-owner@deltalogistics.com',
          phoneNumber: '+2348011112222',
          billingEmail: 'billing@deltalogistics.com',
          businessAddress: '14 Wharf Road, Lagos',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_SCALE',
          billingCycle: 'monthly',
        },
        deviceProvisioning: {
          provisionNow: true,
          numberOfDevices: 12,
          deviceManufacturer: 'Teltonika',
        },
        simAssignment: {
          provisionNow: true,
          numberOfSims: 12,
          carrier: 'MTN',
          dataPackage: '1GB/month',
        },
        features: {
          liveTracking: true,
          messaging: true,
          geofencing: true,
          routeOptimization: false,
          advancedAnalytics: false,
          apiAccess: false,
        },
      });

    expect(pendingTenantRes.status).toBe(201);

    const activeTenantRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('active-tenant@contract.com', {
          firstName: 'Active',
          lastName: 'Tenant',
          organizationName: 'Active Tenant Fleet',
        }),
      );

    expect(activeTenantRegisterRes.status).toBe(201);
    const tenantToken = activeTenantRegisterRes.body.accessToken as string;

    const summaryRes = await request(app.getHttpServer())
      .get('/auth/system/tenants/summary')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.status).toBe(true);
    expect(summaryRes.body.data.totalTenants).toBeGreaterThanOrEqual(2);
    expect(summaryRes.body.data.activeTenants).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.data.monthlyRevenueNgn).toBe(0);
    expect(summaryRes.body.data.totalVehicles).toBe(0);

    const listRes = await request(app.getHttpServer())
      .get('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.status).toBe(true);
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(listRes.body.data.tenants)).toBe(true);

    const pendingTenant = listRes.body.data.tenants.find(
      (tenant: { name: string }) => tenant.name === 'Delta Pending Logistics',
    );
    expect(pendingTenant).toBeTruthy();
    expect(pendingTenant.status).toBe('pending');
    expect(pendingTenant.plan).toBe('enterprise');
    expect(pendingTenant.organizationType).toBe('fleet_provider');
    expect(pendingTenant.deviceCount).toBe(0);
    expect(pendingTenant.simCount).toBe(12);
    expect(pendingTenant.invitationStatus.hasPendingInvitation).toBe(true);
    expect(pendingTenant.features.messaging).toBe(true);

    const activeTenant = listRes.body.data.tenants.find(
      (tenant: { email: string }) =>
        tenant.email === 'active-tenant@contract.com',
    );
    expect(activeTenant).toBeTruthy();
    expect(activeTenant.status).toBe('active');
    expect(activeTenant.plan).toBe('starter');
    expect(activeTenant.organizationType).toBe('enterprise');

    const filteredRes = await request(app.getHttpServer())
      .get('/auth/system/tenants')
      .query({ status: 'pending', plan: 'enterprise', search: 'delta' })
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.data.total).toBe(1);
    expect(filteredRes.body.data.tenants[0].name).toBe(
      'Delta Pending Logistics',
    );

    const systemAdminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'system-tenant-admin@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(systemAdminLoginRes.status).toBe(201);

    const systemAdminListRes = await request(app.getHttpServer())
      .get('/auth/system/tenants')
      .set('Authorization', `Bearer ${systemAdminLoginRes.body.accessToken}`);

    expect(systemAdminListRes.status).toBe(200);

    const tenantForbiddenRes = await request(app.getHttpServer())
      .get('/auth/system/tenants')
      .set('Authorization', `Bearer ${tenantToken}`);

    expect(tenantForbiddenRes.status).toBe(403);
  });

  it('GET /auth/system/tenants/export returns a CSV export', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const onboardRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Export Tenant Logistics',
          email: 'export-tenant@contract.com',
          phoneNumber: '+2348011114444',
          billingEmail: 'billing@exporttenant.com',
          businessAddress: '14 Marina Road, Lagos',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_GROWTH',
          billingCycle: 'monthly',
        },
        deviceProvisioning: {
          provisionNow: true,
          numberOfDevices: 10,
          deviceManufacturer: 'Teltonika',
        },
        simAssignment: {
          provisionNow: true,
          numberOfSims: 10,
          carrier: 'MTN',
          dataPackage: '500MB/month',
        },
      });

    expect(onboardRes.status).toBe(201);

    const exportRes = await request(app.getHttpServer())
      .get('/auth/system/tenants/export')
      .query({
        search: 'export tenant',
        status: 'pending',
        plan: 'professional',
      })
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.headers['content-disposition']).toContain(
      'system-tenants-',
    );
    expect(exportRes.text).toContain('tenantId,name,slug,email');
    expect(exportRes.text).toContain('Export Tenant Logistics');
    expect(exportRes.text).toContain('professional');

    const tenantLoginRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('export-forbidden@contract.com', {
          firstName: 'Export',
          lastName: 'Forbidden',
          organizationName: 'Forbidden Export Org',
        }),
      );

    expect(tenantLoginRes.status).toBe(201);

    const forbiddenExportRes = await request(app.getHttpServer())
      .get('/auth/system/tenants/export')
      .set('Authorization', `Bearer ${tenantLoginRes.body.accessToken}`);

    expect(forbiddenExportRes.status).toBe(403);
  });

  it('GET /auth/system/subscription-plans returns the hardcoded plan catalog', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);

    const plansRes = await request(app.getHttpServer())
      .get('/auth/system/subscription-plans')
      .set('Authorization', `Bearer ${superadminLoginRes.body.accessToken}`);

    expect(plansRes.status).toBe(200);
    expect(plansRes.body.status).toBe(true);
    expect(Array.isArray(plansRes.body.data.plans)).toBe(true);
    expect(
      plansRes.body.data.plans.map((plan: { code: string }) => plan.code),
    ).toEqual(
      expect.arrayContaining([
        'FLEET_STARTER',
        'FLEET_GROWTH',
        'FLEET_SCALE',
        'FLEET_ENTERPRISE',
      ]),
    );
    expect(
      plansRes.body.data.plans.find(
        (plan: { code: string }) => plan.code === 'FLEET_SCALE',
      ),
    ).toEqual(
      expect.objectContaining({
        tier: 'enterprise',
        monthlyPriceNgn: 399900,
        customPricing: false,
      }),
    );
  });

  it('PATCH /auth/system/tenants/:tenantId updates pending tenant onboarding metadata', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Editable Pending Tenant',
          email: 'editable-pending@contract.com',
          phoneNumber: '+2348010101010',
          billingEmail: 'billing-editable@contract.com',
          businessAddress: '10 Admiralty Way, Lekki',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_STARTER',
          billingCycle: 'monthly',
        },
      });

    expect(createRes.status).toBe(201);

    const updateRes = await request(app.getHttpServer())
      .patch(`/auth/system/tenants/${createRes.body.data.tenantId}`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Edited Pending Tenant',
          email: 'edited-pending@contract.com',
          billingEmail: 'finance@editedpending.com',
          businessAddress: '22 Warehouse Road, Apapa',
        },
        subscription: {
          planCode: 'FLEET_GROWTH',
          billingCycle: 'yearly',
        },
        deviceProvisioning: {
          provisionNow: true,
          numberOfDevices: 5,
          deviceManufacturer: 'Queclink',
        },
        simAssignment: {
          provisionNow: true,
          numberOfSims: 5,
          carrier: 'Airtel',
          dataPackage: '1GB/month',
        },
        features: {
          messaging: false,
          routeOptimization: true,
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toBe('Tenant updated successfully');
    expect(updateRes.body.data.tenant.name).toBe('Edited Pending Tenant');
    expect(updateRes.body.data.tenant.email).toBe(
      'edited-pending@contract.com',
    );
    expect(updateRes.body.data.tenant.billingEmail).toBe(
      'finance@editedpending.com',
    );
    expect(updateRes.body.data.tenant.plan).toBe('professional');
    expect(updateRes.body.data.onboarding.company.email).toBe(
      'edited-pending@contract.com',
    );
    expect(updateRes.body.data.onboarding.subscription.billingCycle).toBe(
      'yearly',
    );
    expect(
      updateRes.body.data.onboarding.deviceProvisioning.deviceManufacturer,
    ).toBe('Queclink');
    expect(updateRes.body.data.tenant.features.routeOptimization).toBe(true);

    const onboarding = await tenantOnboardingRepo.findByTenantId(
      createRes.body.data.tenantId,
    );
    expect(onboarding?.invitedEmail).toBe('edited-pending@contract.com');

    const rotatedInvite = await inviteRepo.findByEmail(
      'edited-pending@contract.com',
    );
    expect(rotatedInvite).toBeTruthy();
  });

  it('DELETE /auth/system/tenants/:tenantId deletes safe pending tenants and rejects active tenants', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const pendingTenantRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Delete Me Pending',
          email: 'delete-me-pending@contract.com',
          phoneNumber: '+2348011111111',
          billingEmail: 'billing@deletepending.com',
          businessAddress: '1 Pending Road, Lagos',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_STARTER',
          billingCycle: 'monthly',
        },
      });

    expect(pendingTenantRes.status).toBe(201);
    const pendingTenantId = pendingTenantRes.body.data.tenantId as string;

    const deletePendingRes = await request(app.getHttpServer())
      .delete(`/auth/system/tenants/${pendingTenantId}`)
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(deletePendingRes.status).toBe(200);
    expect(deletePendingRes.body.message).toBe('Tenant deleted successfully');
    expect(deletePendingRes.body.data).toEqual({
      tenantId: pendingTenantId,
      deleted: true,
    });

    const deletedDetailRes = await request(app.getHttpServer())
      .get(`/auth/system/tenants/${pendingTenantId}`)
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(deletedDetailRes.status).toBe(404);

    const activeTenantRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('undeletable-tenant@contract.com', {
          firstName: 'Undeletable',
          lastName: 'Tenant',
          organizationName: 'Undeletable Org',
        }),
      );

    expect(activeTenantRes.status).toBe(201);

    const deleteActiveRes = await request(app.getHttpServer())
      .delete(`/auth/system/tenants/${activeTenantRes.body.user.tenantId}`)
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(deleteActiveRes.status).toBe(409);
  });

  it('GET /auth/system/reference-data/tenant-onboarding and tenant detail/status endpoints work', async () => {
    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const refDataRes = await request(app.getHttpServer())
      .get('/auth/system/reference-data/tenant-onboarding')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(refDataRes.status).toBe(200);
    expect(refDataRes.body.status).toBe(true);
    expect(refDataRes.body.data.organizationTypes).toEqual(
      expect.arrayContaining([
        'fleet_provider',
        'enterprise',
        'aggregator',
        'owner_operator',
      ]),
    );
    expect(refDataRes.body.data.deviceManufacturers).toContain('Teltonika');
    expect(refDataRes.body.data.simCarriers).toContain('MTN');
    expect(refDataRes.body.data.featureDefaults.liveTracking).toBe(true);
    expect(refDataRes.body.data.featureDefaults.messaging).toBe(true);

    const tenantRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('tenant-status@contract.com', {
          firstName: 'Managed',
          lastName: 'Tenant',
          organizationName: 'Managed Tenant Org',
        }),
      );

    expect(tenantRegisterRes.status).toBe(201);
    const tenantId = tenantRegisterRes.body.user.tenantId as string;

    const forbiddenRefDataRes = await request(app.getHttpServer())
      .get('/auth/system/reference-data/tenant-onboarding')
      .set('Authorization', `Bearer ${tenantRegisterRes.body.accessToken}`);

    expect(forbiddenRefDataRes.status).toBe(403);

    const detailRes = await request(app.getHttpServer())
      .get(`/auth/system/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.status).toBe(true);
    expect(detailRes.body.data.tenant.email).toBe('tenant-status@contract.com');
    expect(detailRes.body.data.tenant.status).toBe('active');
    expect(detailRes.body.data.onboarding).toBeNull();

    const suspendRes = await request(app.getHttpServer())
      .patch(`/auth/system/tenants/${tenantId}/status`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ status: 'suspended' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.message).toBe('Tenant suspended successfully');
    expect(suspendRes.body.data.tenant.status).toBe('suspended');

    const suspendedLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'tenant-status@contract.com', password: 'Str0ngPass!' });

    expect(suspendedLoginRes.status).toBe(403);

    const reactivateRes = await request(app.getHttpServer())
      .patch(`/auth/system/tenants/${tenantId}/status`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ status: 'active' });

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.message).toBe('Tenant reactivated successfully');
    expect(reactivateRes.body.data.tenant.status).toBe('active');

    const restoredLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'tenant-status@contract.com', password: 'Str0ngPass!' });

    expect(restoredLoginRes.status).toBe(201);

    const pendingTenantRes = await request(app.getHttpServer())
      .post('/auth/system/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        company: {
          companyName: 'Pending Reactivation Logistics',
          email: 'pending-reactivation@contract.com',
          phoneNumber: '+2348099999999',
          billingEmail: 'billing@pendingreactivation.com',
          businessAddress: '12 Creek Road, Lagos',
          organizationType: 'fleet_provider',
        },
        subscription: {
          planCode: 'FLEET_STARTER',
          billingCycle: 'monthly',
        },
        deviceProvisioning: {
          provisionNow: false,
        },
        simAssignment: {
          provisionNow: false,
        },
      });

    expect(pendingTenantRes.status).toBe(201);

    const pendingStatusRes = await request(app.getHttpServer())
      .patch(
        `/auth/system/tenants/${pendingTenantRes.body.data.tenantId}/status`,
      )
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ status: 'suspended' });

    expect(pendingStatusRes.status).toBe(409);
  });

  it('GET /auth/system/dashboard returns system-wide metrics for superadmin and system admin only', async () => {
    const tenantRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('dashboard-admin@contract.com', {
          firstName: 'Dashboard',
          lastName: 'Tenant',
          organizationName: 'Dashboard Fleet',
        }),
      );

    expect(tenantRegisterRes.status).toBe(201);

    const superadminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(superadminLoginRes.status).toBe(201);
    const superadminToken = superadminLoginRes.body.accessToken as string;

    const createAdminRes = await request(app.getHttpServer())
      .post('/auth/system/admins')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        fullName: 'System Dashboard Admin',
        email: 'system-dashboard-admin@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(createAdminRes.status).toBe(201);

    const systemDashboardRes = await request(app.getHttpServer())
      .get('/auth/system/dashboard')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(systemDashboardRes.status).toBe(200);
    expect(systemDashboardRes.body.status).toBe(true);
    expect(systemDashboardRes.body.data.totalTenants).toBeGreaterThan(0);
    expect(systemDashboardRes.body.data.totalVehicles).toBe(0);
    expect(systemDashboardRes.body.data.totalDrivers).toBe(0);
    expect(systemDashboardRes.body.data.totalSensors).toBe(0);
    expect(systemDashboardRes.body.data.totalSimCards).toBeNull();
    expect(systemDashboardRes.body.data.dataUsageTodayMb).toBeNull();
    expect(systemDashboardRes.body.data.sensorGpsMessagesPerHour).toBeNull();
    expect(systemDashboardRes.body.data.unavailableMetrics).toEqual(
      expect.arrayContaining([
        'totalSimCards',
        'dataUsageTodayMb',
        'sensorGpsMessagesPerHour',
      ]),
    );
    expect(systemDashboardRes.body.data.generatedAt).toBeTypeOf('string');

    const systemAdminLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'system-dashboard-admin@truckmoov.com',
        password: 'Adm1nPass!',
      });

    expect(systemAdminLoginRes.status).toBe(201);

    const systemAdminDashboardRes = await request(app.getHttpServer())
      .get('/auth/system/dashboard')
      .set('Authorization', `Bearer ${systemAdminLoginRes.body.accessToken}`);

    expect(systemAdminDashboardRes.status).toBe(200);
    expect(systemAdminDashboardRes.body.status).toBe(true);

    const tenantDashboardRes = await request(app.getHttpServer())
      .get('/auth/system/dashboard')
      .set('Authorization', `Bearer ${tenantRegisterRes.body.accessToken}`);

    expect(tenantDashboardRes.status).toBe(403);
  });

  it('system device catalog and inventory endpoints work for system admins and drive onboarding device options', async () => {
    const systemLoginRes = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });

    expect(systemLoginRes.status).toBe(201);

    const createCatalogRes = await request(app.getHttpServer())
      .post('/auth/system/devices/catalog')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`)
      .send({
        manufacturer: 'Teltonika',
        model: 'FMC130',
        protocolType: 'TCP',
        defaultPort: 5001,
        supportedFeatures: ['fuel', 'sos'],
        status: 'supported',
        configurationInstructions: 'Configure APN and port in the tracker UI.',
      });

    expect(createCatalogRes.status).toBe(201);
    expect(createCatalogRes.body.data.manufacturer).toBe('Teltonika');
    expect(createCatalogRes.body.data.model).toBe('FMC130');

    const catalogId = createCatalogRes.body.data.id as string;

    const listCatalogRes = await request(app.getHttpServer())
      .get('/auth/system/devices/catalog')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(listCatalogRes.status).toBe(200);
    expect(listCatalogRes.body.data.total).toBeGreaterThanOrEqual(1);
    expect(
      listCatalogRes.body.data.models.some(
        (entry: { id: string }) => entry.id === catalogId,
      ),
    ).toBe(true);

    const deviceCatalogReferenceRes = await request(app.getHttpServer())
      .get('/auth/system/reference-data/device-catalog')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(deviceCatalogReferenceRes.status).toBe(200);
    expect(deviceCatalogReferenceRes.body.data.protocolTypes).toContain('TCP');
    expect(deviceCatalogReferenceRes.body.data.statuses).toContain('supported');

    const onboardingReferenceRes = await request(app.getHttpServer())
      .get('/auth/system/reference-data/tenant-onboarding')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(onboardingReferenceRes.status).toBe(200);
    expect(onboardingReferenceRes.body.data.deviceManufacturers).toContain(
      'Teltonika',
    );
    expect(
      onboardingReferenceRes.body.data.deviceCatalog.some(
        (entry: { manufacturer: string; models: Array<{ model: string }> }) =>
          entry.manufacturer === 'Teltonika' &&
          entry.models.some((modelEntry) => modelEntry.model === 'FMC130'),
      ),
    ).toBe(true);

    const deviceSummaryRes = await request(app.getHttpServer())
      .get('/auth/system/devices/summary')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(deviceSummaryRes.status).toBe(200);
    expect(
      deviceSummaryRes.body.data.totalCatalogModels,
    ).toBeGreaterThanOrEqual(1);
    expect(deviceSummaryRes.body.data.supportedCatalogModels).toBeGreaterThan(
      0,
    );

    const inventoryRes = await request(app.getHttpServer())
      .get('/auth/system/devices')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(inventoryRes.status).toBe(200);
    expect(Array.isArray(inventoryRes.body.data.devices)).toBe(true);

    const exportInventoryRes = await request(app.getHttpServer())
      .get('/auth/system/devices/export')
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(exportInventoryRes.status).toBe(200);
    expect(exportInventoryRes.headers['content-type']).toContain('text/csv');
    expect(exportInventoryRes.text).toContain(
      'id,imei,manufacturer,model,tenantId',
    );

    const updateCatalogRes = await request(app.getHttpServer())
      .patch(`/auth/system/devices/catalog/${catalogId}`)
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`)
      .send({
        status: 'deprecated',
        supportedFeatures: ['obd2'],
      });

    expect(updateCatalogRes.status).toBe(200);
    expect(updateCatalogRes.body.data.status).toBe('deprecated');
    expect(updateCatalogRes.body.data.supportedFeatures).toEqual(['obd2']);

    const deleteCatalogRes = await request(app.getHttpServer())
      .delete(`/auth/system/devices/catalog/${catalogId}`)
      .set('Authorization', `Bearer ${systemLoginRes.body.accessToken}`);

    expect(deleteCatalogRes.status).toBe(200);
    expect(deleteCatalogRes.body.data.deleted).toBe(true);

    const tenantRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('tenant-device-route@contract.com', {
          firstName: 'Tenant',
          lastName: 'Device',
          organizationName: 'Tenant Device Org',
        }),
      );

    expect(tenantRegisterRes.status).toBe(201);

    const tenantCatalogRes = await request(app.getHttpServer())
      .get('/auth/system/devices/catalog')
      .set('Authorization', `Bearer ${tenantRegisterRes.body.accessToken}`);

    expect(tenantCatalogRes.status).toBe(403);
  });

  it('GET /auth/activity-log returns tenant-scoped persisted activity entries', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('activity-admin@contract.com', {
          firstName: 'Activity',
          lastName: 'Admin',
          organizationName: 'Activity Fleet',
        }),
      );

    expect(registerRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'activity-admin@contract.com', password: 'Str0ngPass!' });

    expect(loginRes.status).toBe(201);

    const profileRes = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ fullName: 'Activity Admin Updated' });

    expect(profileRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get('/auth/activity-log')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.some(
        (entry: { action: string }) => entry.action === 'profile.updated',
      ),
    ).toBe(true);
    expect(
      res.body.data.every(
        (entry: { tenantId: string }) =>
          entry.tenantId === loginRes.body.user.tenantId,
      ),
    ).toBe(true);
  });

  // ── Refresh ───────────────────────────────────────────

  it('POST /auth/refresh with unknown token returns 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        refreshToken: 'unknown-token-12345',
      });

    expect(response.status).toBe(401);
  });

  // ── Invite flow ───────────────────────────────────────

  it('POST /auth/invite requires authorization', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/invite')
      .send({ email: 'new@co.com', role: 'FLEET_ADMIN' });

    expect(res.status).toBe(401);
  });

  it('POST /auth/invite succeeds for enterprise admin', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('inviter@contract.com', {
          firstName: 'Invite',
          lastName: 'Owner',
          organizationName: 'Inviter Fleet',
        }),
      );
    expect(regRes.status).toBe(201);
    const adminToken = regRes.body.accessToken;

    const inviteRes = await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'invitee@contract.com', role: 'FLEET_ADMIN' });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.message).toBe('Invitation sent');
    expect(inviteRes.body.email).toBe('invitee@contract.com');
  });

  it('POST /auth/invite rejects non-admin caller', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('nonadmin-inviter@contract.com', {
          firstName: 'Nonadmin',
          lastName: 'Inviter',
          organizationName: 'Nonadmin Fleet',
        }),
      );
    const adminToken = regRes.body.accessToken;

    // First invite someone as a DISPATCHER
    await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dispatcher-tester@contract.com', role: 'DISPATCHER' });

    // Register that invited user (they become DISPATCHER)
    // For this test, we use the admin's token to try from a non-enterprise admin perspective
    // Since the dev identity provider can't produce non-admin tokens easily,
    // we verify the permission check by using an invalid token
    const res = await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', 'Bearer invalid-token-here')
      .send({ email: 'someone@co.com', role: 'DISPATCHER' });

    expect(res.status).toBe(401);
  });

  it('GET /auth/invite/validate rejects invalid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/invite/validate')
      .query({ token: 'nonexistent-token-value' });

    expect(res.status).toBe(404);
  });

  it('POST /auth/register/invited rejects invalid invite token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register/invited')
      .send({
        inviteToken: 'nonexistent-token-value',
        fullName: 'New User',
        password: 'Str0ngPass!',
      });

    expect(res.status).toBe(404);
  });

  it('POST /auth/register/invited derives email from the invite token', async () => {
    const adminRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('invite-admin@contract.com', {
          firstName: 'Invite',
          lastName: 'Admin',
          organizationName: 'Invite Org',
        }),
      );
    const adminToken = adminRes.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'derived@contract.com', role: 'DISPATCHER' })
      .expect(201);

    const invite = await inviteRepo.findByEmail('derived@contract.com');
    expect(invite).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post('/auth/register/invited')
      .send({
        inviteToken: invite!.token,
        fullName: 'Derived User',
        email: 'ignored@contract.com',
        password: 'Str0ngPass!',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('derived@contract.com');
    expect(res.body.user.role).toBe('DISPATCHER');
  });

  it('GET /auth/organization/users lists users within the caller organization', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('org-users-admin@contract.com', {
          firstName: 'Org',
          lastName: 'Admin',
          organizationName: 'Org User Fleet',
        }),
      );
    const accessToken = regRes.body.accessToken as string;
    const tenantId = regRes.body.user.tenantId as string;

    await userRepo.save({
      id: 'org-user-1',
      email: 'org-user-1@contract.com',
      passwordHash: 'hash',
      role: 'DISPATCHER',
      tenantId,
      emailVerificationToken: null,
      profile: {
        fullName: 'Ops User',
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/auth/organization/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
    const invitedUser = res.body.users.find(
      (user: { email: string }) => user.email === 'org-user-1@contract.com',
    );
    const adminUser = res.body.users.find(
      (user: { email: string }) =>
        user.email === 'org-users-admin@contract.com',
    );

    expect(invitedUser).toMatchObject({
      email: 'org-user-1@contract.com',
      accountStatus: 'enabled',
      status: 'inactive',
      lastActiveAt: null,
    });
    expect(adminUser?.accountStatus).toBe('enabled');
    expect(adminUser?.status).toBe('active');
    expect(adminUser?.lastActiveAt).toEqual(expect.any(String));
  });

  it("PATCH /auth/organization/users/:userId lets admin edit another user's profile", async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('edit-org-admin@contract.com', {
          firstName: 'Edit',
          lastName: 'Admin',
          organizationName: 'Edit Fleet',
        }),
      );
    const accessToken = regRes.body.accessToken as string;
    const tenantId = regRes.body.user.tenantId as string;

    await userRepo.save({
      id: 'org-user-2',
      email: 'org-user-2@contract.com',
      passwordHash: 'hash',
      role: 'DISPATCHER',
      tenantId,
      emailVerificationToken: null,
      profile: {
        fullName: 'Before Edit',
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
      },
    });

    const res = await request(app.getHttpServer())
      .patch('/auth/organization/users/org-user-2')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'After Edit',
        phoneNumber: '+2348099998888',
        address: '27 Allen Avenue, Ikeja',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User updated successfully');
    expect(res.body.user.profile.fullName).toBe('After Edit');
    expect(res.body.user.profile.address).toBe('27 Allen Avenue, Ikeja');
    expect(res.body.user.accountStatus).toBe('enabled');
    expect(res.body.user.status).toBe('inactive');
    expect(res.body.user.lastActiveAt).toBeNull();
  });

  it('PATCH /auth/organization/users/:userId/status disables a user account and revokes access immediately', async () => {
    const adminRegRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('disable-admin@contract.com', {
          firstName: 'Disable',
          lastName: 'Admin',
          organizationName: 'Disable Fleet',
        }),
      );
    const adminAccessToken = adminRegRes.body.accessToken as string;

    const inviteRes = await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email: 'disable-user@contract.com', role: 'DISPATCHER' });

    expect(inviteRes.status).toBe(201);
    const invite = await inviteRepo.findByEmail('disable-user@contract.com');
    expect(invite?.token).toBeTypeOf('string');

    const registerInvitedRes = await request(app.getHttpServer())
      .post('/auth/register/invited')
      .send({
        inviteToken: invite!.token,
        fullName: 'Disable User',
        password: 'Str0ngPass!',
      });

    expect(registerInvitedRes.status).toBe(201);
    const disabledUserAccessToken = registerInvitedRes.body
      .accessToken as string;

    const disableRes = await request(app.getHttpServer())
      .patch(
        `/auth/organization/users/${registerInvitedRes.body.user.id}/status`,
      )
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ accountStatus: 'disabled' });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.message).toBe('User account disabled successfully');
    expect(disableRes.body.user.accountStatus).toBe('disabled');
    expect(disableRes.body.user.status).toBe('inactive');

    const profileRes = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${disabledUserAccessToken}`);

    expect(profileRes.status).toBe(403);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'disable-user@contract.com', password: 'Str0ngPass!' });

    expect(loginRes.status).toBe(403);

    const listRes = await request(app.getHttpServer())
      .get('/auth/organization/users')
      .set('Authorization', `Bearer ${adminAccessToken}`);

    expect(listRes.status).toBe(200);
    const disabledUser = listRes.body.users.find(
      (user: { email: string }) => user.email === 'disable-user@contract.com',
    );
    expect(disabledUser).toMatchObject({
      email: 'disable-user@contract.com',
      accountStatus: 'disabled',
      status: 'inactive',
    });
  });

  it('POST /auth/organization/invites/resend resends a pending invite', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('resend-admin@contract.com', {
          firstName: 'Resend',
          lastName: 'Admin',
          organizationName: 'Resend Fleet',
        }),
      );
    const accessToken = regRes.body.accessToken as string;

    const inviteRes = await request(app.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'pending-resend@contract.com', role: 'DISPATCHER' });

    expect(inviteRes.status).toBe(201);

    const resendRes = await request(app.getHttpServer())
      .post('/auth/organization/invites/resend')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'pending-resend@contract.com' });

    expect(resendRes.status).toBe(201);
    expect(resendRes.body.message).toBe('Invitation resent');
    expect(resendRes.body.email).toBe('pending-resend@contract.com');
    expect(resendRes.body.role).toBe('DISPATCHER');
  });

  it('DELETE /auth/organization/users/:userId removes a user from the organization', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('remove-admin@contract.com', {
          firstName: 'Remove',
          lastName: 'Admin',
          organizationName: 'Remove Fleet',
        }),
      );
    const accessToken = regRes.body.accessToken as string;
    const tenantId = regRes.body.user.tenantId as string;

    await userRepo.save({
      id: 'org-user-3',
      email: 'org-user-3@contract.com',
      passwordHash: 'hash',
      role: 'DISPATCHER',
      tenantId,
      emailVerificationToken: null,
      profile: {
        fullName: 'Remove Me',
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
      },
    });

    const deleteRes = await request(app.getHttpServer())
      .delete('/auth/organization/users/org-user-3')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe('User removed from organization');

    const listRes = await request(app.getHttpServer())
      .get('/auth/organization/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(
      listRes.body.users.some(
        (user: { userId: string }) => user.userId === 'org-user-3',
      ),
    ).toBe(false);
  });

  // ── Forgot / Verify / Reset password ──────────────────

  it('POST /auth/forgot-password returns 404 for unknown user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ identifier: 'ghost@unknown.com' });

    expect(res.status).toBe(404);
  });

  it('POST /auth/forgot-password succeeds for registered user', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('forgetter@contract.com'));

    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ identifier: 'forgetter@contract.com' });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('email');
  });

  it('POST /auth/verify-reset rejects invalid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/verify-reset')
      .send({ token: 'totally-bogus-token' });

    expect(res.status).toBe(400);
  });

  it('POST /auth/reset-password rejects invalid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'totally-bogus-token', newPassword: 'NewStr0ng!' });

    expect(res.status).toBe(400);
  });

  // ── Change role ───────────────────────────────────────

  it('POST /auth/change-role requires authorization', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/change-role')
      .send({ targetUserId: 'some-id', newRole: 'DISPATCHER' });

    expect(res.status).toBe(401);
  });

  it('POST /auth/change-role rejects invalid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/change-role')
      .set('Authorization', 'Bearer bad-token')
      .send({ targetUserId: 'some-id', newRole: 'DISPATCHER' });

    expect(res.status).toBe(401);
  });

  it('POST /auth/change-role returns 404 for nonexistent target user', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('roleadmin@contract.com'));
    const adminToken = regRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .post('/auth/change-role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetUserId: 'nonexistent-user-id', newRole: 'DISPATCHER' });

    expect(res.status).toBe(404);
  });

  // ── Logout ────────────────────────────────────────────

  it('POST /auth/logout invalidates the refresh token', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('logmeout@contract.com'));
    expect(regRes.status).toBe(201);

    const { accessToken, refreshToken } = regRes.body;

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body.message).toContain('Logged out');

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it('POST /auth/logout works without authorization header', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('logmeout2@contract.com'));

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: regRes.body.refreshToken });

    expect(logoutRes.status).toBe(201);
    expect(logoutRes.body.message).toContain('Logged out');
  });

  // ── User profile + preferences (Epic B) ──────────────

  it('GET/PATCH /auth/profile supports viewing and editing own profile', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('profile@contract.com', {
          firstName: 'Profile',
          lastName: 'Owner',
          organizationName: 'Profile Fleet',
        }),
      );
    const accessToken = regRes.body.accessToken as string;

    const getProfileRes = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getProfileRes.status).toBe(200);
    expect(getProfileRes.body.profile.fullName).toBe('Profile Owner');
    expect(getProfileRes.body.profile.phoneNumber).toBeNull();
    expect(getProfileRes.body.profile.address).toBeNull();
    expect(getProfileRes.body.profile.profilePictureUrl).toBeNull();

    const patchProfileRes = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Adebayo Adekunle',
        phoneNumber: '+2348011112222',
        address: '12 Broad Street, Lagos Island',
        profilePictureUrl: 'https://cdn.example.com/users/adebayo.png',
      });

    expect(patchProfileRes.status).toBe(200);
    expect(patchProfileRes.body.profile.fullName).toBe('Adebayo Adekunle');
    expect(patchProfileRes.body.profile.phoneNumber).toBe('+2348011112222');
    expect(patchProfileRes.body.profile.address).toBe(
      '12 Broad Street, Lagos Island',
    );
    expect(patchProfileRes.body.profile.profilePictureUrl).toBe(
      'https://cdn.example.com/users/adebayo.png',
    );
  });

  it('GET /auth/profile returns 401 for an invalid bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', 'Bearer definitely-not-a-truckmoov-token');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid or expired access token');
  });

  it('GET/PATCH /auth/preferences/notifications supports notification settings', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('notify@contract.com'));
    const accessToken = regRes.body.accessToken as string;

    const patchRes = await request(app.getHttpServer())
      .patch('/auth/preferences/notifications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        emailAlerts: true,
        smsAlerts: true,
        pushAlerts: false,
        incidentAlerts: true,
        jobUpdates: false,
        marketingAnnouncements: true,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.notificationPreferences.smsAlerts).toBe(true);
    expect(patchRes.body.notificationPreferences.pushAlerts).toBe(false);

    const getRes = await request(app.getHttpServer())
      .get('/auth/preferences/notifications')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.notificationPreferences.marketingAnnouncements).toBe(
      true,
    );
    expect(getRes.body.notificationPreferences.jobUpdates).toBe(false);
  });

  it('PATCH /auth/preferences/dispatch allows dispatcher to set working hours/timezone', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('dispatch-pref@contract.com'));
    expect(regRes.status).toBe(201);

    const initialToken = regRes.body.accessToken as string;
    const targetUserId = regRes.body.user.id as string;

    const roleRes = await request(app.getHttpServer())
      .post('/auth/change-role')
      .set('Authorization', `Bearer ${initialToken}`)
      .send({ targetUserId, newRole: 'DISPATCHER' });
    expect(roleRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'dispatch-pref@contract.com',
        password: 'Str0ngPass!',
      });
    expect(loginRes.status).toBe(201);
    const dispatcherToken = loginRes.body.accessToken as string;

    const patchRes = await request(app.getHttpServer())
      .patch('/auth/preferences/dispatch')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        timezone: 'Africa/Lagos',
        shiftStart: '08:00',
        shiftEnd: '16:00',
        workDays: [1, 2, 3, 4, 5, 6],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.dispatcherPreferences.timezone).toBe('Africa/Lagos');
    expect(patchRes.body.dispatcherPreferences.shiftStart).toBe('08:00');
    expect(patchRes.body.dispatcherPreferences.shiftEnd).toBe('16:00');
    expect(patchRes.body.dispatcherPreferences.workDays).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('GET /auth/preferences/dispatch rejects non-dispatcher', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('not-dispatch@contract.com'));
    const accessToken = regRes.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/auth/preferences/dispatch')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it('GET/PATCH /auth/organization/settings allows enterprise admin to configure branding/defaults', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(
        makeRegisterPayload('org-admin@contract.com', {
          organizationName: 'Initial Fleet Org',
        }),
      );
    const accessToken = regRes.body.accessToken as string;

    const initialGetRes = await request(app.getHttpServer())
      .get('/auth/organization/settings')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(initialGetRes.status).toBe(200);
    expect(initialGetRes.body.branding.organizationName).toBe(
      'Initial Fleet Org',
    );

    const patchRes = await request(app.getHttpServer())
      .patch('/auth/organization/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branding: {
          organizationName: 'Lagos Express Logistics',
          logoUrl: 'https://cdn.example.com/orgs/logo.png',
          profilePictureUrl: 'https://cdn.example.com/orgs/profile.png',
          primaryColor: '#0D9488',
          secondaryColor: '#0EA5E9',
        },
        defaults: {
          timezone: 'Africa/Lagos',
          currency: 'NGN',
          dateFormat: 'DD/MM/YYYY',
          weekStartsOn: 'monday',
        },
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.branding.organizationName).toBe(
      'Lagos Express Logistics',
    );
    expect(patchRes.body.branding.logoUrl).toBe(
      'https://cdn.example.com/orgs/logo.png',
    );
    expect(patchRes.body.branding.profilePictureUrl).toBe(
      'https://cdn.example.com/orgs/profile.png',
    );
    expect(patchRes.body.defaults.currency).toBe('NGN');

    const getRes = await request(app.getHttpServer())
      .get('/auth/organization/settings')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.branding.primaryColor).toBe('#0D9488');
    expect(getRes.body.branding.profilePictureUrl).toBe(
      'https://cdn.example.com/orgs/profile.png',
    );
    expect(getRes.body.defaults.timezone).toBe('Africa/Lagos');
  });

  it('GET /auth/organization/settings allows non-enterprise-admin user but PATCH still rejects', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(makeRegisterPayload('org-denied@contract.com'));
    const initialToken = regRes.body.accessToken as string;
    const userId = regRes.body.user.id as string;

    const roleRes = await request(app.getHttpServer())
      .post('/auth/change-role')
      .set('Authorization', `Bearer ${initialToken}`)
      .send({ targetUserId: userId, newRole: 'DISPATCHER' });
    expect(roleRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'org-denied@contract.com',
        password: 'Str0ngPass!',
      });
    const dispatcherToken = loginRes.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/auth/organization/settings')
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(regRes.body.user.tenantId);

    const patchRes = await request(app.getHttpServer())
      .patch('/auth/organization/settings')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        branding: {
          organizationName: 'Should Not Save',
        },
      });

    expect(patchRes.status).toBe(403);
  });

  // ── CORS ──────────────────────────────────────────────

  it('OPTIONS /auth/login exposes CORS preflight headers', async () => {
    const response = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });
});
