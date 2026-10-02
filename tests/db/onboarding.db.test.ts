import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MikroORM } from "@mikro-orm/postgresql";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-application.repository";
import { MikroOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-payment.repository";
import { MikroQuotationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-quotation.repository";
import { MikroInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/mikro-invoice.repository";
import { InvoiceIssuanceService } from "@auth/onboarding/application/services/invoice-issuance.service";
import { InvoiceSeriesInvoiceNumbers } from "../../apps/auth/src/invoice-number.allocator";
import { OrderQuotationService } from "@auth/onboarding/application/services/order-quotation.service";
import { MikroInvoiceNumberRepository } from "../../apps/auth/src/mikro-invoice-number.repository";
import { InvoiceNumberService } from "../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesQuotationNumbers } from "../../apps/auth/src/quotation-number.allocator";
import { MikroM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/mikro-m2m-license-plan.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import {
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
} from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import type { PlatformAlertPublisher } from "../../apps/auth/src/platform-alert.publisher";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type {
  OnboardingApplicationRepository,
  StoredOnboardingApplication,
} from "@auth/onboarding/domain/onboarding-application.repository";
import type { PaymentGateway } from "../../apps/auth/src/contexts/payments";

const SLICE = "onboarding";
const INSTALL_PER_DEVICE_NGN = 15_000;

describe.skipIf(!dbEnabled)("onboarding application payment (db)", () => {
  let orm: MikroORM;
  let applications: MikroOnboardingApplicationRepository;
  let payments: MikroOnboardingPaymentRepository;
  let plans: MikroM2mLicensePlanRepository;
  let stageAdvances: number;
  let gatewayCalls: string[];
  let gatewayError: Error | null;
  let pending: unknown[];

  beforeAll(async () => {
    orm = await getOrm();
    const config = { db: getConfig() } as never;
    applications = new MikroOnboardingApplicationRepository(config);
    payments = new MikroOnboardingPaymentRepository(config);
    plans = new MikroM2mLicensePlanRepository(config);
  });

  afterAll(async () => {
    await orm?.close();
  });

  beforeEach(() => {
    stageAdvances = 0;
    gatewayCalls = [];
    gatewayError = null;
    pending = [];
  });

  async function seed(perDeviceNgn: number, quantity: number) {
    const id = uniqueId(SLICE);
    const token = `tok-${randomUUID()}`;
    const planCode = uniqueId(`${SLICE}-plan`).slice(0, 64);
    const now = new Date();
    await plans.save({
      id: uniqueId(`${SLICE}-pl`),
      code: planCode,
      name: "Test",
      description: "Test plan",
      perDeviceYear1Ngn: perDeviceNgn,
      perDeviceRenewalNgn: perDeviceNgn,
      validityDays: 365,
      components: null,
      lastPriceChangedAt: null,
      sortOrder: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const application: StoredOnboardingApplication = {
      id,
      reference: `APP-${randomUUID().slice(0, 24)}`,
      tokenHash: hashApplicationToken(token),
      applicantType: "fleet_provider",
      organizationName: "Arne logistics Ltd",
      businessEmail: `${id}@arne.test`,
      organizationPhone: "+2348000000000",
      contactFullName: "Jane Doe",
      contactRole: null,
      streetAddress: "Mazi Fedelis Street",
      city: "Abuja",
      state: "FCT",
      rcNumber: null,
      taxIdentificationNumber: null,
      identificationType: null,
      identificationNumber: null,
      m2mPlanCode: planCode,
      billingEmail: "accounts@arne.test",
      billingEmailVerifiedAt: now,
      emailVerifiedAt: now,
      phoneVerifiedAt: now,
      status: "approved",
      stage: "payment",
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      tenantId: null,
      setupLinkStatus: null,
      setupLinkSentAt: null,
      setupLinkError: null,
      setupLinkAttempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await applications.save(application);
    await applications.saveDeviceRequest({
      id: uniqueId(`${SLICE}-dr`),
      applicationId: id,
      quantity,
      useCase: "Tracking the distribution fleet",
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    const totalKobo =
      (perDeviceNgn + INSTALL_PER_DEVICE_NGN) * quantity * 100;
    return { id, totalKobo, token };
  }

  function countingApplications(): OnboardingApplicationRepository {
    return new Proxy(applications, {
      get(target, prop, receiver) {
        if (prop !== "save") return Reflect.get(target, prop, receiver).bind(target);
        return async (app: StoredOnboardingApplication) => {
          if (app.stage === "installation_scheduling") stageAdvances++;
          return target.save(app);
        };
      },
    }) as unknown as OnboardingApplicationRepository;
  }

  function gateway(): PaymentGateway {
    return {
      name: "paystack",
      isConfigured: () => true,
      initiateCharge: async (request: { reference: string }) => {
        gatewayCalls.push(request.reference);
        const row = await payments.findByReference(request.reference);
        pending.push(row);
        expect(row?.status).toBe("pending");
        expect(row?.authorizationUrl).toBeNull();
        if (gatewayError) throw gatewayError;
        return {
          reference: request.reference,
          authorizationUrl: `https://pay.test/${request.reference}`,
          provider: "paystack",
        };
      },
    } as unknown as PaymentGateway;
  }

  function useCases() {
    const apps = countingApplications();
    let n = 0;
    const config = { db: getConfig() } as never;
    const settings = new InMemoryBillingSettingsRepository();
    const quotationRepo = new MikroQuotationRepository(config);
    const quotations = new OrderQuotationService(
      quotationRepo,
      new InvoiceSeriesQuotationNumbers(new InvoiceNumberService(new MikroInvoiceNumberRepository(config))),
      plans,
      settings,
      { generate: () => `${uniqueId(SLICE)}-q${++n}` },
    );
    return {
      pay: new CreateApplicationPaymentUseCase(
        apps,
        plans,
        payments,
        gateway(),
        new GetOnboardingApplicationUseCase(apps),
        { generate: () => `${uniqueId(SLICE)}-${++n}` },
        settings,
        quotations,
      ),
      confirm: new ConfirmApplicationPaymentUseCase(
        apps,
        payments,
        new InvoiceIssuanceService(
          quotationRepo,
          new MikroInvoiceRepository(config),
          payments,
          settings,
          new InvoiceSeriesInvoiceNumbers(new InvoiceNumberService(new MikroInvoiceNumberRepository(config))),
          { sendInvoice: async () => undefined },
          { record: async () => undefined },
          { generate: () => `${uniqueId(SLICE)}-i${++n}` },
        ),
        { raise: async () => undefined } as unknown as PlatformAlertPublisher,
      ),
    };
  }

  const paidFor = (amountKobo: number) => ({ amountKobo, currency: "NGN" });

  it("round-trips amounts above 2^31 kobo", async () => {
    const { id, totalKobo, token } = await seed(12_000_000, 2);
    expect(totalKobo).toBeGreaterThan(2 ** 31);
    const { pay } = useCases();

    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    const stored = await payments.findByReference(started.reference);
    expect(stored?.amountKobo).toBe(totalKobo);
    const raw = await orm.em
      .getConnection()
      .execute(`select amount_kobo::text as v from onboarding_payments where reference = ?`, [started.reference]);
    expect(raw[0].v).toBe(String(totalKobo));
    expect(await payments.findLatestForApplication(id)).toMatchObject({ amountKobo: totalKobo });
  });

  it("records the pending row before the gateway is called", async () => {
    const { id, token } = await seed(25_000, 2);
    const { pay } = useCases();

    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    expect(gatewayCalls).toEqual([started.reference]);
    expect(pending).toHaveLength(1);
    expect(await payments.findByReference(started.reference)).toMatchObject({
      status: "pending",
      authorizationUrl: started.authorizationUrl,
    });
  });

  it("deletes the unstarted row when the gateway fails", async () => {
    const { id, token } = await seed(25_000, 1);
    const { pay } = useCases();
    gatewayError = new Error("boom");

    await expect(pay.execute({ applicationId: id, applicationToken: token })).rejects.toThrow("boom");

    expect(await payments.findLatestForApplication(id)).toBeNull();
  });

  it("reuses the stored authorization url within 30 minutes", async () => {
    const { id, token } = await seed(25_000, 2);
    const { pay } = useCases();

    const first = (await pay.execute({ applicationId: id, applicationToken: token })).data;
    const second = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    expect(second.reference).toBe(first.reference);
    expect(second.authorizationUrl).toBe(first.authorizationUrl);
    expect(gatewayCalls).toHaveLength(1);
  });

  it("does not reuse a pending payment older than 30 minutes", async () => {
    const { id, token } = await seed(25_000, 2);
    const { pay } = useCases();
    const first = (await pay.execute({ applicationId: id, applicationToken: token })).data;
    await orm.em
      .getConnection()
      .execute(`update onboarding_payments set created_at = now() - interval '31 minutes' where reference = ?`, [
        first.reference,
      ]);

    const second = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    expect(second.reference).not.toBe(first.reference);
    expect(gatewayCalls).toHaveLength(2);
  });

  it("settles exactly once and advances the stage once under 10 concurrent deliveries", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    await Promise.all(
      Array.from({ length: 10 }, () => confirm.execute(started.reference, true, paidFor(totalKobo))),
    );

    const stored = await payments.findByReference(started.reference);
    expect(stored?.status).toBe("paid");
    expect((await applications.findById(id))?.stage).toBe("installation_scheduling");
    expect(stageAdvances).toBe(1);
  });

  it("settlePending succeeds for exactly one of concurrent callers", async () => {
    const { id, token } = await seed(25_000, 1);
    const { pay } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;
    const stored = (await payments.findByReference(started.reference))!;

    const results = await Promise.all(
      Array.from({ length: 10 }, () => payments.settlePending(stored.id, "paid", new Date())),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("a webhook after a crash before the stage advance still advances it", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;
    const stored = (await payments.findByReference(started.reference))!;
    await payments.settlePending(stored.id, "paid", new Date());
    expect((await applications.findById(id))?.stage).toBe("payment");

    await confirm.execute(started.reference, true, paidFor(totalKobo));

    expect((await applications.findById(id))?.stage).toBe("installation_scheduling");
    expect(stageAdvances).toBe(1);
  });

  it("marks an amount mismatch and does not advance, then settles a correct delivery", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    await confirm.execute(started.reference, true, paidFor(totalKobo - 1));

    expect((await payments.findByReference(started.reference))?.status).toBe("mismatch");
    expect((await applications.findById(id))?.stage).toBe("payment");
    expect(stageAdvances).toBe(0);

    await confirm.execute(started.reference, true, paidFor(totalKobo));

    expect((await payments.findByReference(started.reference))?.status).toBe("paid");
    expect(stageAdvances).toBe(1);
  });

  it("marks a wrong currency as mismatch", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    await confirm.execute(started.reference, true, { amountKobo: totalKobo, currency: "USD" });

    expect((await payments.findByReference(started.reference))?.status).toBe("mismatch");
    expect(stageAdvances).toBe(0);
  });

  it("a failed payment turns paid on a later correct success, once", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    await confirm.execute(started.reference, false);
    await Promise.all(
      Array.from({ length: 5 }, () => confirm.execute(started.reference, true, paidFor(totalKobo))),
    );

    const stored = await payments.findByReference(started.reference);
    expect(stored?.status).toBe("paid");
    expect(stored?.paidAt).not.toBeNull();
    expect((await applications.findById(id))?.stage).toBe("installation_scheduling");
    expect(stageAdvances).toBe(1);
  });

  it("a failure racing a success settles one outcome and stays consistent", async () => {
    const { id, totalKobo, token } = await seed(25_000, 2);
    const { pay, confirm } = useCases();
    const started = (await pay.execute({ applicationId: id, applicationToken: token })).data;

    await Promise.all([
      confirm.execute(started.reference, false),
      confirm.execute(started.reference, true, paidFor(totalKobo)),
    ]);

    const status = (await payments.findByReference(started.reference))?.status;
    const stage = (await applications.findById(id))?.stage;
    expect(status === "paid" ? stage : "payment").toBe(status === "paid" ? "installation_scheduling" : "payment");
    expect(stageAdvances).toBe(status === "paid" ? 1 : 0);
  });
});
