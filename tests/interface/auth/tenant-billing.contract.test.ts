import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const TOTAL_NGN = 225_000;
const TOTAL_KOBO = TOTAL_NGN * 100;

describe('Tenant billing HTTP contract', () => {
  let app: INestApplication;
  let staffToken: string;
  let tokenFor: (tenantId: string) => Promise<string>;
  let issueRenewal: (tenantId: string, periodEnd: string) => Promise<void>;
  let fundWallet: (tenantId: string, kobo: number) => Promise<void>;
  let chargeRequests: Array<{ metadata?: Record<string, unknown>; amountKobo: number; reference: string }>;
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
    });
    vi.resetModules();
    const { AppModule } = await import('../../../apps/auth/src/app.module');
    const { USER_REPOSITORY } = await import('../../../apps/auth/src/contexts/auth/session');
    const { PASSWORD_HASHER } = await import('../../../apps/auth/src/contexts/auth/session/domain/ports/password-hasher.port');
    const { PAYMENT_GATEWAY } = await import('../../../apps/auth/src/contexts/payments');
    const { TENANT_WALLET_REPOSITORY } = await import('../../../apps/auth/src/tenant-wallet.repository');
    const { LICENCE_PERIOD_REPOSITORY, RENEWAL_FACTS_READER } = await import('@auth/onboarding/domain/licence-period.repository');
    const { RenewalInvoiceService } = await import('@auth/onboarding/application/services/renewal-invoice.service');

    chargeRequests = [];
    const gateway = {
      name: 'paystack',
      signatureHeader: 'x-paystack-signature',
      isConfigured: () => true,
      initiateCharge: async (charge: { reference: string; amountKobo: number; metadata?: Record<string, unknown> }) => {
        chargeRequests.push(charge);
        return { reference: charge.reference, authorizationUrl: `https://pay.test/${charge.reference}`, provider: 'paystack' };
      },
      verifyCallbackSignature: () => false,
      parseCallback: () => null,
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('auth');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const users = moduleRef.get(USER_REPOSITORY);
    const hasher = moduleRef.get(PASSWORD_HASHER);
    const periods = moduleRef.get(LICENCE_PERIOD_REPOSITORY);
    const facts = moduleRef.get(RENEWAL_FACTS_READER);
    const wallets = moduleRef.get(TENANT_WALLET_REPOSITORY);
    const renewals = moduleRef.get(RenewalInvoiceService);

    tokenFor = async (tenantId) => {
      const email = `${tenantId}@billing.contract`;
      await users.save({
        id: randomUUID(), email, passwordHash: await hasher.hash('Str0ngPass!'), role: 'ENTERPRISE_ADMIN', tenantId,
        emailVerificationToken: null,
        profile: { fullName: 'Tenant Admin', phoneNumber: null, address: null, profilePictureUrl: null },
      });
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'Str0ngPass!' });
      return login.body.accessToken ?? login.body.data?.accessToken;
    };
    issueRenewal = async (tenantId, periodEnd) => {
      periods.add({
        tenantId, applicationId: `app-${tenantId}`, planCode: 'm2m_standard', deviceCount: 3,
        periodStart: '2025-01-01', periodEnd, origin: 'purchase',
      });
      facts.byTenant.set(tenantId, {
        applicationPlanCode: 'm2m_standard', customerName: 'Billing Co', customerType: 'enterprise',
        billingEmail: 'billing@co.test', adminEmail: null, fleetDeviceCount: 0, hasUser: true, terminated: false,
      });
      await renewals.run(new Date());
    };
    fundWallet = async (tenantId, kobo) => {
      await wallets.ensure(tenantId);
      await wallets.credit(tenantId, kobo, {
        category: 'top_up', quantity: 1, unitRateKobo: kobo, reason: 'fund', idempotencyKey: `fund-${tenantId}`,
      });
    };

    const login = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({ email: 'superadmin@truckmoov.com', password: 'SuperAdmin123!' });
    staffToken = login.body.data?.accessToken ?? login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    process.env = previous;
    vi.resetModules();
  });

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
  const get = (path: string, token: string) => request(app.getHttpServer()).get(`/auth${path}`).set('Authorization', `Bearer ${token}`);
  const post = (path: string, token: string) => request(app.getHttpServer()).post(`/auth${path}`).set('Authorization', `Bearer ${token}`);

  it('rejects calls without a token', async () => {
    expect((await request(app.getHttpServer()).get('/auth/billing/invoices')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/auth/billing/licence')).status).toBe(401);
  });

  it('keeps staff accounts out of the tenant billing routes', async () => {
    const res = await get('/billing/invoices', staffToken);
    expect([403, 404]).toContain(res.status);
  });

  it('lists, shows and prices the tenant renewal invoice and licence', async () => {
    const tenantId = `bill-${randomUUID().slice(0, 8)}`;
    const token = await tokenFor(tenantId);
    expect((await get('/billing/licence', token)).body.data).toBeNull();
    await issueRenewal(tenantId, inDays(5));

    const list = await get('/billing/invoices?status=open', token);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ status: true, data: { total: 1, nextDueDate: inDays(5) } });
    const [invoice] = list.body.data.items;
    expect(invoice).toMatchObject({
      kind: 'renewal', status: 'issued', payable: true, periodEnd: inDays(5), daysOverdue: 0,
      totalNgn: TOTAL_NGN, outstandingNgn: TOTAL_NGN, amountPaidNgn: 0,
    });
    expect(list.body.data.openTotalNgn).toBe(TOTAL_NGN);
    expect(invoice.graceEndsOn).toBeTruthy();

    const detail = await get(`/billing/invoices/${invoice.id}`, token);
    expect(detail.status).toBe(200);
    expect(detail.body.data.lines).toHaveLength(1);

    const licence = await get('/billing/licence', token);
    expect(licence.body.data).toMatchObject({
      planCode: 'm2m_standard', deviceCount: 3, periodEnd: inDays(5), status: 'active', renewalInvoiceId: invoice.id,
    });
  });

  it('answers 404 for another tenant\'s invoice on every route', async () => {
    const owner = `bill-${randomUUID().slice(0, 8)}`;
    const ownerToken = await tokenFor(owner);
    await issueRenewal(owner, inDays(5));
    const id = (await get('/billing/invoices', ownerToken)).body.data.items[0].id as string;

    const other = await tokenFor(`bill-${randomUUID().slice(0, 8)}`);
    expect((await get('/billing/invoices', other)).body.data.total).toBe(0);
    for (const res of [
      await get(`/billing/invoices/${id}`, other),
      await post(`/billing/invoices/${id}/pay-wallet`, other),
      await post(`/billing/invoices/${id}/pay-card`, other),
    ]) {
      expect(res.status).toBe(404);
    }
  });

  it('reports a wallet shortfall in naira', async () => {
    const tenantId = `bill-${randomUUID().slice(0, 8)}`;
    const token = await tokenFor(tenantId);
    await issueRenewal(tenantId, inDays(5));
    const id = (await get('/billing/invoices', token)).body.data.items[0].id as string;
    await fundWallet(tenantId, 1_000_000);

    const short = await post(`/billing/invoices/${id}/pay-wallet`, token);

    expect(short.status).toBe(400);
    expect(short.body).toMatchObject({
      message: 'Insufficient wallet balance', code: 'INSUFFICIENT_WALLET_BALANCE', shortfallNgn: TOTAL_NGN - 10_000,
    });
  });

  it('pays from the wallet and extends the licence', async () => {
    const tenantId = `bill-${randomUUID().slice(0, 8)}`;
    const token = await tokenFor(tenantId);
    await issueRenewal(tenantId, inDays(5));
    const id = (await get('/billing/invoices', token)).body.data.items[0].id as string;
    await fundWallet(tenantId, TOTAL_KOBO + 100);

    const paid = await post(`/billing/invoices/${id}/pay-wallet`, token);
    expect(paid.status).toBe(201);
    expect(paid.body.data).toMatchObject({
      paidFromWalletNgn: TOTAL_NGN, invoice: { status: 'paid', payable: false, outstandingNgn: 0 },
    });
    expect(paid.body.data.newPeriodEnd).toBeTruthy();
    expect((await get('/billing/licence', token)).body.data.periodEnd).toBe(paid.body.data.newPeriodEnd);

    const again = await post(`/billing/invoices/${id}/pay-wallet`, token);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'INVOICE_NOT_PAYABLE' });
  });

  it('starts a card payment priced from the invoice with renewal-only metadata', async () => {
    const tenantId = `bill-${randomUUID().slice(0, 8)}`;
    const token = await tokenFor(tenantId);
    await issueRenewal(tenantId, inDays(5));
    const id = (await get('/billing/invoices', token)).body.data.items[0].id as string;

    const res = await post(`/billing/invoices/${id}/pay-card`, token).send({ amountNgn: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amountNgn: TOTAL_NGN, authorizationUrl: `https://pay.test/${res.body.data.reference}` });
    const charge = chargeRequests.at(-1)!;
    expect(charge.amountKobo).toBe(TOTAL_KOBO);
    expect(charge.metadata).toEqual({ kind: 'renewal', renewalInvoiceId: id, applicationId: `app-${tenantId}` });
    expect(Object.keys(charge.metadata!)).not.toEqual(expect.arrayContaining(['tenantId']));
  });

  it('shows renewal invoices to staff with the kind filter, and validates the lead time setting', async () => {
    const tenantId = `bill-${randomUUID().slice(0, 8)}`;
    await tokenFor(tenantId);
    await issueRenewal(tenantId, inDays(5));

    const renewals = await get('/system/billing/invoices?kind=renewal&limit=100', staffToken);
    expect(renewals.status).toBe(200);
    const mine = renewals.body.data.items.find((row: { tenantId: string }) => row.tenantId === tenantId);
    expect(mine).toMatchObject({ isRenewal: true, periodEnd: inDays(5), quotationId: null });
    const firsts = await get('/system/billing/invoices?kind=first&limit=100', staffToken);
    expect(firsts.body.data.items.some((row: { tenantId: string }) => row.tenantId === tenantId)).toBe(false);
    expect((await get('/system/billing/invoices?kind=nope', staffToken)).status).toBe(400);

    const current = await get('/system/billing/enforcement-settings', staffToken);
    expect(current.body.data).toMatchObject({ renewalLeadDays: 7, limits: { renewalLeadDays: { min: 1, max: 60 } } });
    const put = (body: object) =>
      request(app.getHttpServer()).put('/auth/system/billing/enforcement-settings').set('Authorization', `Bearer ${staffToken}`).send(body);
    expect((await put({ renewalLeadDays: 61, reason: 'testing the range' })).status).toBe(400);
    const changed = await put({ renewalLeadDays: 14, reason: 'testing the setting' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.renewalLeadDays).toBe(14);
    await put({ renewalLeadDays: 7, reason: 'putting it back' });
  });
});
