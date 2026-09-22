import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, afterAll, beforeAll, expect, it, vi } from 'vitest';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(128)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(128),
]);
// Uploads are only sniffed, but a signature is decoded and drawn into the
// signed agreement, so that one has to be a PNG a decoder accepts.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// What an enterprise applicant uploads once for the whole application. The
// vehicle licence is per vehicle and is uploaded separately.
const DOCUMENT_TYPES = [
  'customer_request_letter',
  'cac_document',
  'tax_certificate_or_tin',
  'signature_card',
  'utility_bill',
  'identification_card',
  'proof_of_ownership',
];

const VEHICLE = {
  registrationNumber: 'LAG-123-ABC',
  vehicleType: 'truck',
  make: 'Toyota',
  model: 'Hilux',
};

function applicationPayload(overrides: Record<string, string> = {}) {
  return {
    applicantType: 'fleet_provider',
    organizationName: 'Arne logistics Ltd',
    businessEmail: 'jane@arne.com',
    organizationPhone: '+234 80 0000 0000',
    contactFullName: 'Jane Doe',
    contactRole: 'Fleet Manager',
    m2mPlanCode: 'm2m_standard',
    streetAddress: 'Mazi Fedelis Street',
    city: 'Abuja',
    state: 'FCT',
    ...overrides,
  };
}

describe('Onboarding applications HTTP contract', () => {
  let app: INestApplication;
  let codeFor: (applicationId: string, channel: string) => Promise<string>;
  let sentEmails: Array<{
    to: string;
    subject: string;
    variables?: Record<string, string>;
  }>;
  let sentSms: Array<{
    tenantId: string;
    channel: string;
    recipient: string;
    content: string;
  }>;

  const previousBackend = process.env.PERSISTENCE_BACKEND;
  const previousSuperadminEmail = process.env.SUPERADMIN_EMAIL;
  const previousSuperadminPassword = process.env.SUPERADMIN_PASSWORD;
  const previousSuperadminTenantId = process.env.SUPERADMIN_TENANT_ID;

  beforeAll(async () => {
    process.env.PERSISTENCE_BACKEND = 'in-memory';
    process.env.SUPERADMIN_EMAIL = 'superadmin@truckmoov.com';
    process.env.SUPERADMIN_PASSWORD = 'SuperAdmin123!';
    process.env.SUPERADMIN_FULL_NAME = 'Truckmoov Super Admin';
    process.env.SUPERADMIN_TENANT_ID = 'system';
    // The whole file runs from one address, so the per-IP bound is lifted here.
    // Per-application code limits and the token check are what these tests
    // exercise, and they are unaffected by this.
    process.env.ONBOARDING_RATE_LIMIT_RPS = '1000';
    process.env.ONBOARDING_RATE_LIMIT_BURST = '100000';
    vi.resetModules();

    const { AppModule } = await import('../../../apps/auth/src/app.module');

    const { ObjectStorageService } = await import('@shared/object-storage');

    // There is no bucket in the test environment. Everything except the byte
    // write is exercised for real; the store itself is recorded in memory.
    const storedObjects = new Map<string, { contentType: string }>();
    const objectStorageStub = {
      async putObject(input: { key: string; contentType: string }) {
        storedObjects.set(input.key, { contentType: input.contentType });
        return input.key;
      },
      async deleteObject(key: string) {
        storedObjects.delete(key);
      },
      async createPresignedDownloadUrl(input: { key: string }) {
        return `https://objects.test/${input.key}?signed=1`;
      },
      hasPublicBaseUrl() {
        return false;
      },
    };

    const { MailerService } = await import('@shared/mailer');

    // No SMTP and no notification service in tests. The notifier itself runs
    // for real; only the two transports it reaches are recorded.
    sentEmails = [];
    const mailerStub = {
      async send(input: {
        to: string;
        subject: string;
        variables?: Record<string, string>;
      }) {
        sentEmails.push(input);
      },
    };

    sentSms = [];
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: { body: string }) => {
        sentSms.push(JSON.parse(init.body));
        return { ok: true, status: 200 } as Response;
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageStub)
      .overrideProvider(MailerService)
      .useValue(mailerStub)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('auth');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );

    // Codes never leave the transports in readable form anywhere else: they are
    // stored hashed, so a test reads the one that was actually delivered.
    codeFor = async (_applicationId: string, channel: string) => {
      if (channel === 'email') {
        const email = sentEmails.at(-1);
        const code = email?.variables?.code;
        if (!code) throw new Error('no email code was sent');
        return code;
      }
      const sms = sentSms.at(-1);
      const match = sms?.content?.match(/\b(\d{6})\b/);
      if (!match) throw new Error('no sms code was sent');
      return match[1];
    };

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.PERSISTENCE_BACKEND = previousBackend;
    process.env.SUPERADMIN_EMAIL = previousSuperadminEmail;
    process.env.SUPERADMIN_PASSWORD = previousSuperadminPassword;
    process.env.SUPERADMIN_TENANT_ID = previousSuperadminTenantId;
    delete process.env.ONBOARDING_RATE_LIMIT_RPS;
    delete process.env.ONBOARDING_RATE_LIMIT_BURST;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function systemToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/system/login')
      .send({
        email: 'superadmin@truckmoov.com',
        password: 'SuperAdmin123!',
      });
    return res.body.accessToken as string;
  }

  async function startApplication(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/applications')
      .send(applicationPayload({ businessEmail: email }));
    expect(res.status).toBe(201);
    return {
      id: res.body.data.id as string,
      token: res.body.data.applicationToken as string,
    };
  }

  async function addVehicle(
    id: string,
    token: string,
    overrides: Record<string, string> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/vehicles`)
      .set('x-application-token', token)
      .send({ ...VEHICLE, ...overrides });
    expect(res.status).toBe(201);
    const vehicles = res.body.data.vehicles as Array<{
      id: string;
      registrationNumber: string;
    }>;
    const registrationNumber = (
      overrides.registrationNumber ?? VEHICLE.registrationNumber
    ).toUpperCase();
    return vehicles.find(
      (vehicle) => vehicle.registrationNumber === registrationNumber,
    )!.id;
  }

  async function uploadAll(id: string, token: string) {
    for (const documentType of DOCUMENT_TYPES) {
      const pdf = documentType === 'customer_request_letter';
      const res = await request(app.getHttpServer())
        .post(`/auth/onboarding/applications/${id}/documents`)
        .set('x-application-token', token)
        .field('document_type', documentType)
        .attach('file', pdf ? PDF : PNG, pdf ? 'letter.pdf' : 'scan.png');
      expect(res.status).toBe(201);
    }
  }

  async function signIndemnity(id: string, token: string) {
    const agreement = await request(app.getHttpServer()).get(
      '/auth/onboarding/applications/indemnity-agreement',
    );
    expect(agreement.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/indemnity-signature`)
      .set('x-application-token', token)
      .field('signer_name', 'Jane Doe')
      .field('template_version', agreement.body.data.version)
      .field('method', 'drawn')
      .attach('file', REAL_PNG, 'signature.png');
    expect(res.status).toBe(201);
  }

  /** A vehicle plus its licence, which is what the submit gate counts. */
  async function addVehicleWithLicence(id: string, token: string) {
    const vehicleId = await addVehicle(id, token);
    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/documents`)
      .set('x-application-token', token)
      .field('document_type', 'vehicle_license')
      .field('vehicle_id', vehicleId)
      .attach('file', PNG, 'licence.png');
    expect(res.status).toBe(201);
    return vehicleId;
  }

  async function verifyBoth(id: string, token: string) {
    for (const [path, channel] of [
      ['email', 'email'],
      ['phone', 'sms'],
    ] as const) {
      const sent = await request(app.getHttpServer())
        .post(`/auth/onboarding/applications/${id}/verify/${path}/send`)
        .set('x-application-token', token);
      expect(sent.status).toBe(201);

      const res = await request(app.getHttpServer())
        .post(`/auth/onboarding/applications/${id}/verify/${path}`)
        .set('x-application-token', token)
        .send({ code: await codeFor(id, channel) });
      expect(res.status).toBe(201);
    }
  }

  it('starts an application and reports every document as missing', async () => {
    const { id, token } = await startApplication('start@arne.com');

    const res = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', token);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.organization.organizationPhone).toBe('+2348000000000');
    expect(res.body.data.missingDocuments).toHaveLength(8);
    expect(res.body.data.verification).toEqual({
      emailVerified: false,
      phoneVerified: false,
    });
  });

  it('rejects a phone number containing letters', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/applications')
      .send(
        applicationPayload({
          businessEmail: 'letters@arne.com',
          organizationPhone: '+234 80 0000 000O',
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('organizationPhone');
  });

  it('rejects a state that is not Nigerian', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/applications')
      .send(
        applicationPayload({ businessEmail: 'state@arne.com', state: 'Texas' }),
      );

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('state');
  });

  it('refuses a second live application for the same email', async () => {
    await startApplication('duplicate@arne.com');

    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/applications')
      .send(applicationPayload({ businessEmail: 'duplicate@arne.com' }));

    expect(res.status).toBe(409);
  });

  it('refuses to read an application with the wrong token', async () => {
    const { id } = await startApplication('wrongtoken@arne.com');

    const res = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', 'not-the-token');

    expect(res.status).toBe(404);
  });

  it('requires the application token', async () => {
    const { id } = await startApplication('notoken@arne.com');

    const res = await request(app.getHttpServer()).get(
      `/auth/onboarding/applications/${id}`,
    );

    expect(res.status).toBe(401);
  });

  it('rejects a document whose contents are not a permitted format', async () => {
    const { id, token } = await startApplication('badfile@arne.com');

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/documents`)
      .set('x-application-token', token)
      .field('document_type', 'utility_bill')
      .attach('file', Buffer.from('PKnot-a-document'), 'bill.pdf');

    expect(res.status).toBe(400);
  });

  it('requires the customer request letter to be a PDF', async () => {
    const { id, token } = await startApplication('letterpdf@arne.com');

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/documents`)
      .set('x-application-token', token)
      .field('document_type', 'customer_request_letter')
      .attach('file', PNG, 'letter.png');

    expect(res.status).toBe(400);
  });

  it('replaces a document type on re-upload rather than accumulating', async () => {
    const { id, token } = await startApplication('replace@arne.com');

    for (const name of ['first.png', 'second.png']) {
      const res = await request(app.getHttpServer())
        .post(`/auth/onboarding/applications/${id}/documents`)
        .set('x-application-token', token)
        .field('document_type', 'utility_bill')
        .attach('file', PNG, name);
      expect(res.status).toBe(201);
    }

    const res = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', token);

    expect(res.body.data.documents).toHaveLength(1);
    expect(res.body.data.documents[0].documentName).toBe('second.png');
  });

  it('refuses a wrong verification code and accepts the right one', async () => {
    const { id, token } = await startApplication('otp@arne.com');

    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email/send`)
      .set('x-application-token', token);

    const wrong = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email`)
      .set('x-application-token', token)
      .send({ code: '000000' });
    expect([400]).toContain(wrong.status);

    const right = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email`)
      .set('x-application-token', token)
      .send({ code: await codeFor(id, 'email') });

    expect(right.status).toBe(201);
    expect(right.body.data.verification.emailVerified).toBe(true);
  });

  it('bills the onboarding SMS to the platform, never the applicant', async () => {
    const { id, token } = await startApplication('smsbill@arne.com');

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/phone/send`)
      .set('x-application-token', token);

    expect(res.status).toBe(201);
    const sent = sentSms.at(-1);
    expect(sent?.tenantId).toBe('system');
    expect(sent?.channel).toBe('sms');
    expect(sent?.recipient).toBe('+2348000000000');
  });

  it('masks the destination it sent a code to', async () => {
    const { id, token } = await startApplication('masked@arne.com');

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email/send`)
      .set('x-application-token', token);

    expect(res.status).toBe(201);
    expect(res.body.data.destination).toBe('ma****@arne.com');
    expect(res.body.data.expiresInSeconds).toBe(600);
  });

  it('rate limits a resend requested within the cooldown', async () => {
    const { id, token } = await startApplication('cooldown@arne.com');

    const first = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email/send`)
      .set('x-application-token', token);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email/send`)
      .set('x-application-token', token);
    expect(second.status).toBe(429);
  });

  it('clears email verification when the email is changed', async () => {
    const { id, token } = await startApplication('changed@arne.com');

    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email/send`)
      .set('x-application-token', token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/verify/email`)
      .set('x-application-token', token)
      .send({ code: await codeFor(id, 'email') });

    const res = await request(app.getHttpServer())
      .patch(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', token)
      .send(applicationPayload({ businessEmail: 'changed-again@arne.com' }));

    expect(res.status).toBe(200);
    expect(res.body.data.verification.emailVerified).toBe(false);
  });

  it('refuses submission until verification and documents are complete', async () => {
    const { id, token } = await startApplication('incomplete@arne.com');

    const res = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    expect(res.status).toBe(400);
    expect(res.body.missingDocuments).toHaveLength(8);
    expect(res.body.vehicleCount).toBe(0);
    expect(res.body.indemnitySigned).toBe(false);
    expect(res.body.emailVerified).toBe(false);
    expect(res.body.phoneVerified).toBe(false);
  });

  it('submits a complete application and reports the review timeline', async () => {
    const { id, token } = await startApplication('complete@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);

    const submitted = await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe('submitted');

    const status = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}/status`)
      .set('x-application-token', token);

    expect(status.status).toBe(200);
    expect(status.body.data.applicationStatus).toBe('submitted');
    expect(status.body.data.timeline).toHaveLength(4);
    expect(status.body.data.timeline[2].complete).toBe(true);
    expect(status.body.data.timeline[3].inProgress).toBe(true);
  });

  it('refuses edits once the application is submitted', async () => {
    const { id, token } = await startApplication('locked@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    const res = await request(app.getHttpServer())
      .patch(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', token)
      .send(applicationPayload({ businessEmail: 'locked@arne.com', city: 'Lagos' }));

    expect(res.status).toBe(409);
  });

  it('hides the review queue from a caller who is not a platform admin', async () => {
    const res = await request(app.getHttpServer()).get(
      '/auth/system/onboarding/applications',
    );

    expect(res.status).toBe(401);
  });

  it('approves a submitted application, creating a tenant and a setup link', async () => {
    const { id, token } = await startApplication('approve@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    const accessToken = await systemToken();

    const queue = await request(app.getHttpServer())
      .get('/auth/system/onboarding/applications?status=submitted')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(queue.status).toBe(200);
    expect(
      (queue.body.data.items as Array<{ id: string }>).some(
        (item) => item.id === id,
      ),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/auth/system/onboarding/applications/${id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    // Eight uploads plus the signed indemnity form the signature produced.
    expect(detail.body.data.documents).toHaveLength(9);

    const approved = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(approved.status).toBe(201);
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.tenantId).toBeTypeOf('string');
    expect(approved.body.data.bootstrapRole).toBe('FLEET_ADMIN');
    expect(approved.body.data.setupLinkEmail).toBe('approve@arne.com');
  });

  it('rejects an application with a reason the applicant can read back', async () => {
    const { id, token } = await startApplication('reject@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    const accessToken = await systemToken();

    const noReason = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(noReason.status).toBe(400);

    const rejected = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'CAC document does not match the business name' });
    expect(rejected.status).toBe(201);

    const status = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}/status`)
      .set('x-application-token', token);

    expect(status.body.data.applicationStatus).toBe('rejected');
    expect(status.body.data.decisionReason).toBe(
      'CAC document does not match the business name',
    );
  });

  it('sends an application back for changes and invalidates the old token', async () => {
    const { id, token } = await startApplication('changes@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    const accessToken = await systemToken();
    const res = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/request-changes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Utility bill is older than three months' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('changes_requested');

    // The resume link carries a freshly minted token, so the one the applicant
    // was using stops working.
    const stale = await request(app.getHttpServer())
      .get(`/auth/onboarding/applications/${id}`)
      .set('x-application-token', token);
    expect(stale.status).toBe(404);
  });

  it('refuses to approve while a document is rejected', async () => {
    const { id, token } = await startApplication('docreject@arne.com');
    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);

    const accessToken = await systemToken();
    const detail = await request(app.getHttpServer())
      .get(`/auth/system/onboarding/applications/${id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const documentId = detail.body.data.documents[0].id as string;

    const rejectedDocument = await request(app.getHttpServer())
      .patch(
        `/auth/system/onboarding/applications/${id}/documents/${documentId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Unreadable scan' });
    expect(rejectedDocument.status).toBe(200);

    const approve = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(approve.status).toBe(400);
  });

  it('resends the setup link only for an approved application', async () => {
    const { id, token } = await startApplication('resend@arne.com');
    const accessToken = await systemToken();

    const tooEarly = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/setup-link/resend`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(tooEarly.status).toBe(409);

    await uploadAll(id, token);
    await addVehicleWithLicence(id, token);
    await signIndemnity(id, token);
    await verifyBoth(id, token);
    await request(app.getHttpServer())
      .post(`/auth/onboarding/applications/${id}/submit`)
      .set('x-application-token', token);
    await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);

    const resent = await request(app.getHttpServer())
      .post(`/auth/system/onboarding/applications/${id}/setup-link/resend`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(resent.status).toBe(201);
    expect(resent.body.data.setupLinkEmail).toBe('resend@arne.com');
    expect(resent.body.data.setupLinkExpiresAt).toBeTypeOf('string');
  });
});
