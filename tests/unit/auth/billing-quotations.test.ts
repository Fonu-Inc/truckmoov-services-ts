import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PERMISSION_CATALOG, PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import { CreateApplicationPaymentUseCase } from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import {
  GetQuotationUseCase,
  ListQuotationsUseCase,
} from "@auth/onboarding/application/use-cases/billing/quotation-queries.use-cases";
import { BillingNotFoundError, BillingValidationError } from "@auth/onboarding/domain/billing-errors";
import { buildOrderSummary, toKobo } from "@auth/onboarding/domain/onboarding-order";
import { computeTotals, percentToBasisPoints } from "@auth/onboarding/domain/quotation-totals";
import type { QuotationWithLines } from "@auth/onboarding/domain/quotation.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { StoredM2mLicensePlan } from "@auth/onboarding/domain/m2m-license-plan.repository";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import type { PaymentGateway } from "../../../apps/auth/src/contexts/payments";
import { InMemoryInvoiceNumberRepository } from "../../../apps/auth/src/in-memory-invoice-number.repository";
import { InvoiceNumberService } from "../../../apps/auth/src/invoice-number.service";
import { SystemBillingQuotationsController } from "../../../apps/auth/src/system-billing-quotations.controller";
import { buildQuotationKit } from "./quotation-test-kit";

const TOKEN = "applicant-token";
const DAY = 24 * 60 * 60 * 1000;

describe("computeTotals", () => {
  const line = (quantity: number, unitPriceKobo: number) => ({ quantity, unitPriceKobo });

  it("sums quantity times unit price and applies no tax at zero", () => {
    expect(computeTotals([line(2, 2_500_000), line(2, 1_500_000)], 0, 0)).toEqual({
      subtotalKobo: 8_000_000,
      discountKobo: 0,
      taxableKobo: 8_000_000,
      taxKobo: 0,
      totalKobo: 8_000_000,
    });
  });

  it("rounds tax half up", () => {
    expect(computeTotals([line(1, 15)], 0, 1000).taxKobo).toBe(2);
    expect(computeTotals([line(1, 5)], 0, 1000).taxKobo).toBe(1);
    expect(computeTotals([line(1, 4)], 0, 1000).taxKobo).toBe(0);
    expect(computeTotals([line(1, 10_001)], 0, 750).taxKobo).toBe(750);
  });

  it("caps the discount at the subtotal", () => {
    const totals = computeTotals([line(1, 1000)], 5000, 750);
    expect(totals).toMatchObject({ discountKobo: 1000, taxableKobo: 0, taxKobo: 0, totalKobo: 0 });
  });

  it("takes tax on the net amount after the discount", () => {
    const totals = computeTotals([line(1, 100_000)], 20_000, 750);
    expect(totals).toMatchObject({ taxableKobo: 80_000, taxKobo: 6000, totalKobo: 86_000 });
  });

  it("rejects fractional or negative kobo", () => {
    expect(() => computeTotals([line(1, 10.5)], 0, 0)).toThrow(RangeError);
    expect(() => computeTotals([line(1, 10)], -1, 0)).toThrow(RangeError);
  });

  it("converts a percentage to basis points", () => {
    expect(percentToBasisPoints(7.5)).toBe(750);
    expect(percentToBasisPoints(0)).toBe(0);
    expect(percentToBasisPoints(-3)).toBe(0);
  });
});

describe("quotation numbering", () => {
  it("never hands the same number to concurrent callers", async () => {
    const service = new InvoiceNumberService(new InMemoryInvoiceNumberRepository());
    const issuedAt = new Date("2026-10-01T10:00:00Z");

    const all = await Promise.all(
      Array.from({ length: 50 }, () => service.allocatePlatform("quotation", issuedAt)),
    );

    const numbers = all.map((a) => a.invoiceNumber);
    expect(new Set(numbers).size).toBe(50);
    expect(all.map((a) => a.sequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(numbers).toContain("QT-2026-0001");
    expect(numbers).toContain("QT-2026-0050");
  });

  it("keeps the quotation series apart from invoices and restarts each year", async () => {
    const service = new InvoiceNumberService(new InMemoryInvoiceNumberRepository());

    await service.allocatePlatform("platform_subscription", new Date("2026-10-01T00:00:00Z"));
    const first = await service.allocatePlatform("quotation", new Date("2026-10-01T00:00:00Z"));
    const next = await service.allocatePlatform("quotation", new Date("2027-01-02T00:00:00Z"));

    expect(first.invoiceNumber).toBe("QT-2026-0001");
    expect(next.invoiceNumber).toBe("QT-2027-0001");
  });
});

function application(over: Partial<StoredOnboardingApplication> = {}): StoredOnboardingApplication {
  const now = new Date();
  return {
    id: "app-1",
    reference: "APP-2026-AAAA",
    tokenHash: hashApplicationToken(TOKEN),
    applicantType: "fleet_provider",
    organizationName: "Arne logistics Ltd",
    businessEmail: "jane@arne.com",
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
    m2mPlanCode: "m2m_standard",
    billingEmail: "accounts@arne.com",
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
    ...over,
  };
}

function plan(perDeviceYear1Ngn: number): StoredM2mLicensePlan {
  return {
    id: "plan-1",
    code: "m2m_standard",
    name: "Standard",
    description: "Standard M2M licence",
    perDeviceYear1Ngn,
    perDeviceRenewalNgn: 20_000,
    validityDays: 365,
    components: ["SIM data", "Platform access"],
    lastPriceChangedAt: null,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("order quotation on payment start", () => {
  let applications: InMemoryOnboardingApplicationRepository;
  let payments: InMemoryOnboardingPaymentRepository;
  let plans: InMemoryM2mLicensePlanRepository;
  let settings: InMemoryBillingSettingsRepository;
  let kit: ReturnType<typeof buildQuotationKit>;
  let pay: CreateApplicationPaymentUseCase;
  let charged: number[];

  async function setup(planPrice: number, devices: number) {
    await plans.save(plan(planPrice));
    await applications.saveDeviceRequest({
      id: "req-1",
      applicationId: "app-1",
      quantity: devices,
      useCase: "Tracking the distribution fleet",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  beforeEach(async () => {
    applications = new InMemoryOnboardingApplicationRepository();
    payments = new InMemoryOnboardingPaymentRepository();
    plans = new InMemoryM2mLicensePlanRepository();
    settings = new InMemoryBillingSettingsRepository();
    charged = [];
    await applications.save(application());
    kit = buildQuotationKit(plans, settings, payments);
    const gateway = {
      name: "paystack",
      isConfigured: () => true,
      initiateCharge: async (request: { reference: string; amountKobo: number }) => {
        charged.push(request.amountKobo);
        return { reference: request.reference, authorizationUrl: `https://pay.test/${request.reference}`, provider: "paystack" };
      },
    } as unknown as PaymentGateway;
    let ids = 0;
    pay = new CreateApplicationPaymentUseCase(
      applications,
      plans,
      payments,
      gateway,
      new GetOnboardingApplicationUseCase(applications),
      { generate: () => `pay-${++ids}` },
      settings,
      kit.service,
    );
  });

  const start = () => pay.execute({ applicationId: "app-1", applicationToken: TOKEN });

  async function linkedQuotation() {
    const payment = (await payments.findLatestForApplication("app-1")) as StoredOnboardingPayment;
    return kit.repository.findById(payment.quotationId as string);
  }

  it("charges exactly the quotation total at tax 0", async () => {
    await setup(25_000, 2);

    await start();

    const quotation = await linkedQuotation();
    expect(quotation).toMatchObject({
      number: "QT-" + new Date().getUTCFullYear() + "-0001",
      status: "sent",
      subtotalKobo: 8_000_000,
      taxKobo: 0,
      totalKobo: 8_000_000,
      customerName: "Arne logistics Ltd",
      customerType: "fleet_provider",
      billingEmail: "accounts@arne.com",
    });
    expect(charged).toEqual([quotation?.totalKobo]);
  });

  it("charges exactly the quotation total at tax 7.5 with fractional naira", async () => {
    await settings.savePriced([{ key: "default_tax_rate_pct", value: 7.5 }], "admin-1", []);
    await setup(25_001, 3);

    const started = await start();

    const quotation = await linkedQuotation();
    expect(quotation).toMatchObject({
      subtotalKobo: 12_000_300,
      taxRateBp: 750,
      taxKobo: 900_023,
      totalKobo: 12_900_323,
    });
    expect(charged).toEqual([12_900_323]);
    expect(started.data.order.totalNgn).toBe(129_003.23);
    expect(toKobo(started.data.order.totalNgn)).toBe(quotation?.totalKobo);
  });

  it("snapshots a plan line and an installation line", async () => {
    await setup(25_000, 2);

    await start();

    const quotation = await linkedQuotation();
    expect(quotation?.lines.map((l) => [l.kind, l.quantity, l.unitPriceKobo, l.validityDays, l.components])).toEqual([
      ["plan", 2, 2_500_000, 365, ["SIM data", "Platform access"]],
      ["installation", 2, 1_500_000, null, null],
    ]);
  });

  it("reuses the quotation on a second click and links both payments to it", async () => {
    await setup(25_000, 2);

    await start();
    await start();

    const list = await new ListQuotationsUseCase(kit.repository).execute({});
    expect(list.data.total).toBe(1);
  });

  it("starts a new quotation when the total changes", async () => {
    await setup(25_000, 2);
    await start();
    await settings.savePriced([{ key: "default_tax_rate_pct", value: 7.5 }], "admin-1", []);

    await start();

    const list = await new ListQuotationsUseCase(kit.repository).execute({});
    expect(list.data.items.map((i) => i.number).sort()).toEqual([
      `QT-${new Date().getUTCFullYear()}-0001`,
      `QT-${new Date().getUTCFullYear()}-0002`,
    ]);
  });

  it("collapses simultaneous creation to one quotation", async () => {
    await setup(25_000, 2);
    const app = application();
    const summary = buildOrderSummary(plan(25_000), 2, 15_000, 0);

    const results = await Promise.all(Array.from({ length: 6 }, () => kit.service.ensure(app, summary)));

    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await new ListQuotationsUseCase(kit.repository).execute({})).data.total).toBe(1);
  });

  it("extends an expired quotation instead of issuing another number", async () => {
    await setup(25_000, 2);
    const app = application();
    const summary = buildOrderSummary(plan(25_000), 2, 15_000, 0);
    const t0 = new Date("2026-10-01T10:00:00Z");

    const first = await kit.service.ensure(app, summary, t0);
    const later = new Date(t0.getTime() + 31 * DAY);
    const again = await kit.service.ensure(app, summary, later);

    expect(first.validUntil.getTime()).toBe(t0.getTime() + 30 * DAY);
    expect(again.id).toBe(first.id);
    expect(again.number).toBe(first.number);
    expect(again.validUntil.getTime()).toBe(later.getTime() + 30 * DAY);
  });

  it("uses the configured validity window", async () => {
    await settings.savePriced([{ key: "quote_validity_days", value: 7 }], "admin-1", []);
    await setup(25_000, 2);
    const now = new Date("2026-10-01T10:00:00Z");

    const made = await kit.service.ensure(application(), buildOrderSummary(plan(25_000), 2, 15_000, 0), now);

    expect(made.validUntil.getTime()).toBe(now.getTime() + 7 * DAY);
  });
});

function quote(over: Partial<QuotationWithLines> & { id: string }): QuotationWithLines {
  const created = over.createdAt ?? new Date("2026-10-01T10:00:00Z");
  return {
    number: `QT-2026-${over.id}`,
    prefix: "QT",
    year: 2026,
    sequence: 1,
    applicationId: `app-${over.id}`,
    tenantId: null,
    planCode: "m2m_standard",
    deviceCount: 2,
    customerName: "Acme Haulage",
    customerType: "fleet_provider",
    billingEmail: "a@acme.com",
    status: "sent",
    subtotalKobo: 8_000_000,
    discountKobo: 0,
    taxRateBp: 0,
    taxKobo: 0,
    totalKobo: 8_000_000,
    validUntil: new Date(created.getTime() + 30 * DAY),
    sentAt: created,
    acceptedAt: null,
    createdAt: created,
    updatedAt: created,
    lines: [
      { id: `${over.id}-l1`, quotationId: over.id, position: 0, kind: "plan", planCode: "m2m_standard", name: "Standard", description: null, quantity: 2, unitPriceKobo: 2_500_000, validityDays: 365, components: ["SIM data"], isRenewal: false },
      { id: `${over.id}-l2`, quotationId: over.id, position: 1, kind: "installation", planCode: null, name: "Installation", description: null, quantity: 2, unitPriceKobo: 1_500_000, validityDays: null, components: null, isRenewal: false },
    ],
    ...over,
  };
}

function payment(id: string, quotationId: string, amountKobo: number, status: StoredOnboardingPayment["status"]): StoredOnboardingPayment {
  const now = new Date("2026-10-02T10:00:00Z");
  return {
    id, applicationId: "app-x", reference: `REF-${id}`, provider: "paystack", amountKobo,
    authorizationUrl: null, billingEmail: "a@acme.com", planCode: "m2m_standard", deviceCount: 2,
    orderSummary: null, quotationId, invoiceId: null, method: null, customerName: null, note: null, autoReconciled: true, status, paidAt: status === "paid" ? now : null, createdAt: now, updatedAt: now,
  };
}

describe("quotation history", () => {
  let payments: InMemoryOnboardingPaymentRepository;
  let kit: ReturnType<typeof buildQuotationKit>;
  let list: ListQuotationsUseCase;
  let get: GetQuotationUseCase;
  const now = new Date("2026-10-20T00:00:00Z");

  beforeEach(async () => {
    payments = new InMemoryOnboardingPaymentRepository();
    kit = buildQuotationKit(new InMemoryM2mLicensePlanRepository(), new InMemoryBillingSettingsRepository(), payments);
    list = new ListQuotationsUseCase(kit.repository);
    get = new GetQuotationUseCase(kit.repository, payments);

    const d = (day: number) => new Date(Date.UTC(2026, 9, day, 10));
    await kit.repository.createIfAbsent(quote({ id: "01", customerName: "Acme Haulage", createdAt: d(1) }));
    await kit.repository.createIfAbsent(quote({ id: "02", customerName: "Beta Freight", createdAt: d(5), status: "accepted" }));
    await kit.repository.createIfAbsent(quote({ id: "03", customerName: "Gamma Logistics", createdAt: d(10), totalKobo: 10_000_000, taxKobo: 750_000, taxRateBp: 750, subtotalKobo: 9_250_000 }));
    await kit.repository.createIfAbsent(quote({ id: "04", customerName: "Delta Trucks", createdAt: d(15), status: "cancelled" }));
    await payments.save(payment("p1", "02", 8_000_000, "paid"));
    await payments.save(payment("p2", "03", 4_000_000, "paid"));
    await payments.save(payment("p3", "03", 6_000_000, "pending"));
  });

  it("lists newest first with money in naira", async () => {
    const result = await list.execute({}, now);

    expect(result.data.items.map((i) => i.number)).toEqual(["QT-2026-04", "QT-2026-03", "QT-2026-02", "QT-2026-01"]);
    expect(result.data.items[1]).toEqual({
      id: "03",
      number: "QT-2026-03",
      customerName: "Gamma Logistics",
      customerType: "fleet_provider",
      billingEmail: "a@acme.com",
      status: "sent",
      createdAt: "2026-10-10T10:00:00.000Z",
      validUntil: "2026-11-09T10:00:00.000Z",
      subtotalNgn: 92_500,
      discountNgn: 0,
      taxRateBp: 750,
      taxNgn: 7500,
      totalNgn: 100_000,
      paidNgn: 40_000,
      outstandingNgn: 60_000,
      paymentComplete: false,
      lineCount: 2,
    });
  });

  it("matches the search text on number or customer", async () => {
    expect((await list.execute({ q: "gamma" }, now)).data.items.map((i) => i.id)).toEqual(["03"]);
    expect((await list.execute({ q: "2026-02" }, now)).data.items.map((i) => i.id)).toEqual(["02"]);
    expect((await list.execute({ q: "zzz" }, now)).data.total).toBe(0);
  });

  it("applies expiry to the status filter and the row, except accepted and cancelled", async () => {
    const late = new Date("2026-11-12T00:00:00Z");

    const expired = await list.execute({ status: "expired" }, late);
    expect(expired.data.items.map((i) => i.id)).toEqual(["03", "01"]);
    expect(expired.data.items.every((i) => i.status === "expired")).toBe(true);
    expect((await list.execute({ status: "sent" }, late)).data.total).toBe(0);
    expect((await list.execute({ status: "accepted" }, late)).data.items.map((i) => i.id)).toEqual(["02"]);
    expect((await list.execute({ status: "cancelled" }, late)).data.items.map((i) => i.id)).toEqual(["04"]);
  });

  it("filters by payment completeness using successful payments only", async () => {
    expect((await list.execute({ paymentStatus: "complete" }, now)).data.items.map((i) => i.id)).toEqual(["02"]);
    expect((await list.execute({ paymentStatus: "incomplete" }, now)).data.items.map((i) => i.id)).toEqual(["04", "03", "01"]);
  });

  it("pages and reports the total", async () => {
    const second = await list.execute({ page: 2, limit: 3 }, now);

    expect(second.data).toMatchObject({ total: 4, page: 2, limit: 3 });
    expect(second.data.items.map((i) => i.id)).toEqual(["01"]);
    expect((await list.execute({ limit: 500, page: 0 }, now)).data).toMatchObject({ page: 1, limit: 100 });
  });

  it("rejects an unknown status or payment status", async () => {
    await expect(list.execute({ status: "bogus" })).rejects.toBeInstanceOf(BillingValidationError);
    await expect(list.execute({ paymentStatus: "half" })).rejects.toBeInstanceOf(BillingValidationError);
  });

  it("returns the detail with lines and linked payments", async () => {
    const result = await get.execute("03", now);

    expect(result.data).toMatchObject({ id: "03", paidNgn: 40_000, lineCount: 2 });
    expect(result.data.lines).toEqual([
      { kind: "plan", name: "Standard", description: null, quantity: 2, unitPriceNgn: 25_000, lineTotalNgn: 50_000, validityDays: 365, components: ["SIM data"] },
      { kind: "installation", name: "Installation", description: null, quantity: 2, unitPriceNgn: 15_000, lineTotalNgn: 30_000, validityDays: null, components: [] },
    ]);
    const byRef = Object.fromEntries(result.data.payments.map((p) => [p.reference, p]));
    expect(result.data.payments).toHaveLength(2);
    expect(byRef["REF-p2"]).toMatchObject({ amountNgn: 40_000, status: "successful", paidAt: "2026-10-02T10:00:00.000Z" });
    expect(byRef["REF-p3"]).toMatchObject({ amountNgn: 60_000, status: "pending", paidAt: null });
  });

  it("answers an unknown quotation as not found", async () => {
    await expect(get.execute("nope")).rejects.toBeInstanceOf(BillingNotFoundError);
  });
});

describe("quotation routes", () => {
  const proto = SystemBillingQuotationsController.prototype as unknown as Record<string, object>;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && Reflect.hasMetadata(METHOD_METADATA, proto[name]))
    .map((name) => {
      const handler = proto[name];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const requirement = (Reflect.getMetadata(REQUIREMENT_KEY, handler) ?? Reflect.getMetadata(REQUIREMENT_KEY, SystemBillingQuotationsController)) as Requirement;
      return { method, path: Reflect.getMetadata(PATH_METADATA, handler) as string, permissions: neededPermissions(requirement, method) };
    });

  it("serves two read-only routes in the admin portal under system/billing", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemBillingQuotationsController)).toBe("system/billing");
    expect(Reflect.getMetadata(PORTALS_KEY, SystemBillingQuotationsController)).toEqual(["admin"]);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET quotations", "GET quotations/:id"]);
  });

  it("guards every route with a catalogued read permission", () => {
    const known = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
    for (const route of routes) {
      expect(route.permissions).toEqual(["admin.billing.read"]);
      expect(known.has(route.permissions[0])).toBe(true);
    }
  });
});
