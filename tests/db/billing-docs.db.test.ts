import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-application.repository";
import { MikroOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-payment.repository";
import { MikroQuotationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-quotation.repository";
import { MikroInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/mikro-invoice.repository";
import { MikroPaymentHistoryRepository } from "@auth/onboarding/infrastructure/persistence/mikro-payment-history.repository";
import { MikroBillingSummaryRepository } from "@auth/onboarding/infrastructure/persistence/mikro-billing-summary.repository";
import { MikroM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/mikro-m2m-license-plan.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InvoiceIssuanceService } from "@auth/onboarding/application/services/invoice-issuance.service";
import { OrderQuotationService } from "@auth/onboarding/application/services/order-quotation.service";
import { GetOnboardingApplicationUseCase } from "@auth/onboarding/application/use-cases/get-onboarding-application.use-case";
import {
  ConfirmApplicationPaymentUseCase,
  CreateApplicationPaymentUseCase,
} from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import type { PlatformAlertPublisher } from "../../apps/auth/src/platform-alert.publisher";
import { GetQuotationUseCase, ListQuotationsUseCase } from "@auth/onboarding/application/use-cases/billing/quotation-queries.use-cases";
import { GetInvoiceUseCase, ListInvoicesUseCase } from "@auth/onboarding/application/use-cases/billing/invoice-queries.use-cases";
import { ListPaymentsUseCase } from "@auth/onboarding/application/use-cases/billing/payment-queries.use-cases";
import { GetBillingSummaryUseCase } from "@auth/onboarding/application/use-cases/billing/billing-summary.use-case";
import { hashApplicationToken } from "@auth/onboarding/domain/onboarding-application.support";
import { BILLING_SETTING_KEYS } from "@auth/onboarding/domain/billing-settings.repository";
import { lagosDate } from "@auth/onboarding/domain/invoice-dates";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { InvoiceWithLines } from "@auth/onboarding/domain/invoice.repository";
import type { QuotationWithLines } from "@auth/onboarding/domain/quotation.repository";
import type { PaymentGateway } from "../../apps/auth/src/contexts/payments";
import { MikroInvoiceNumberRepository } from "../../apps/auth/src/mikro-invoice-number.repository";
import { InvoiceNumberService } from "../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesInvoiceNumbers } from "../../apps/auth/src/invoice-number.allocator";
import { InvoiceSeriesQuotationNumbers } from "../../apps/auth/src/quotation-number.allocator";
import { GetSystemTenantsSummaryUseCase } from "../../apps/auth/src/get-system-tenants-summary.use-case";

type Row = Record<string, unknown>;
const DAY = 24 * 60 * 60 * 1000;
const PLAN_NGN = 25_000;
const INSTALL_NGN = 15_000;
const DEVICES = 2;
const TOTAL_KOBO = (PLAN_NGN + INSTALL_NGN) * DEVICES * 100 * 1.075;

describe.skipIf(!dbEnabled)("billing documents on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const applications = new MikroOnboardingApplicationRepository(config);
  const payments = new MikroOnboardingPaymentRepository(config);
  const quotations = new MikroQuotationRepository(config);
  const invoices = new MikroInvoiceRepository(config);
  const history = new MikroPaymentHistoryRepository(config);
  const summary = new MikroBillingSummaryRepository(config);
  const plans = new MikroM2mLicensePlanRepository(config);
  const numbers = new InvoiceNumberService(new MikroInvoiceNumberRepository(config));
  const tag = `bd${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const kpiTag = `${tag}kpi`;
  const planCode = `${tag}-plan`;
  const settings = new InMemoryBillingSettingsRepository();
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let seq = 0;
  let sent: string[] = [];
  const usedYears: number[] = [];
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const nextId = (p: string) => `${tag}-${p}${++seq}-${randomUUID().slice(0, 8)}`;

  const issuance = () =>
    new InvoiceIssuanceService(
      quotations,
      invoices,
      payments,
      settings,
      new InvoiceSeriesInvoiceNumbers(numbers),
      { sendInvoice: async (input) => void sent.push(input.invoiceNumber) },
      { record: async () => undefined },
      { generate: () => nextId("i") },
    );
  const orderQuotation = () =>
    new OrderQuotationService(quotations, new InvoiceSeriesQuotationNumbers(numbers), plans, settings, {
      generate: () => nextId("q"),
    });
  const confirm = () => new ConfirmApplicationPaymentUseCase(applications, payments, issuance(), { raise: async () => undefined } as unknown as PlatformAlertPublisher);
  const gateway = {
    name: "paystack",
    isConfigured: () => true,
    initiateCharge: async (request: { reference: string }) => ({
      reference: request.reference,
      authorizationUrl: `https://pay.test/${request.reference}`,
      provider: "paystack",
    }),
  } as unknown as PaymentGateway;
  const pay = () =>
    new CreateApplicationPaymentUseCase(
      applications, plans, payments, gateway, new GetOnboardingApplicationUseCase(applications),
      { generate: () => nextId("p") }, settings, orderQuotation(),
    );
  const listQuotations = new ListQuotationsUseCase(quotations);
  const listInvoices = new ListInvoicesUseCase(invoices);
  const listPayments = new ListPaymentsUseCase(history);

  const seedApplication = async (name: string) => {
    const id = nextId("app");
    const token = `tok-${randomUUID()}`;
    const now = new Date();
    const application: StoredOnboardingApplication = {
      id, reference: `APP-${randomUUID().slice(0, 24)}`, tokenHash: hashApplicationToken(token), applicantType: "fleet_provider",
      organizationName: `${tag} ${name}`, businessEmail: `${id}@arne.test`, organizationPhone: "+2348000000000",
      contactFullName: "Jane Doe", contactRole: null, streetAddress: "Mazi Street", city: "Abuja", state: "FCT",
      rcNumber: null, taxIdentificationNumber: null, identificationType: null, identificationNumber: null,
      m2mPlanCode: planCode, billingEmail: "accounts@arne.test", billingEmailVerifiedAt: now, emailVerifiedAt: now,
      phoneVerifiedAt: now, status: "approved", stage: "payment", submittedAt: now, reviewedBy: null, reviewedAt: null,
      decisionReason: null, tenantId: null, setupLinkStatus: null, setupLinkSentAt: null, setupLinkError: null,
      setupLinkAttempts: 0, createdAt: now, updatedAt: now,
    };
    await applications.save(application);
    await applications.saveDeviceRequest({
      id: nextId("dr"), applicationId: id, quantity: DEVICES, useCase: "Tracking the distribution fleet", notes: null,
      createdAt: now, updatedAt: now,
    });
    return { id, token };
  };

  const startPayment = async (name: string) => {
    const app = await seedApplication(name);
    const started = (await pay().execute({ applicationId: app.id, applicationToken: app.token })).data;
    const payment = (await payments.findByReference(started.reference))!;
    return { ...app, reference: started.reference, payment, quotationId: payment.quotationId! };
  };

  const rawPayment = async (suffix: string, quotationId: string | null, amountKobo: number, over: Partial<StoredOnboardingPayment> = {}) => {
    const payment: StoredOnboardingPayment = {
      id: nextId("pay"), applicationId: nextId("app"), reference: `${tag}-${suffix}`, provider: "paystack", amountKobo,
      authorizationUrl: null, billingEmail: "a@b.com", planCode, deviceCount: DEVICES, orderSummary: null,
      quotationId, invoiceId: null, method: null, customerName: `${tag} ${suffix}`, note: null, autoReconciled: true,
      status: "pending", paidAt: null, createdAt: new Date(), updatedAt: new Date(), ...over,
    };
    await payments.save(payment);
    return payment;
  };

  const rawQuotation = async (name: string, over: Partial<QuotationWithLines> = {}) => {
    const id = nextId("q");
    const allocated = await numbers.allocatePlatform("quotation", new Date());
    const now = new Date();
    const q: QuotationWithLines = {
      id, number: allocated.invoiceNumber, prefix: allocated.prefix, year: allocated.year, sequence: allocated.sequence,
      applicationId: nextId("app"), tenantId: null, planCode, deviceCount: 1, customerName: `${tag} ${name}`,
      customerType: "fleet_provider", billingEmail: "a@b.com", status: "sent", subtotalKobo: 1000, discountKobo: 0,
      taxRateBp: 0, taxKobo: 0, totalKobo: 1000, validUntil: new Date(now.getTime() + 30 * DAY), sentAt: now,
      acceptedAt: null, createdAt: now, updatedAt: now, lines: [], ...over,
    };
    await quotations.createIfAbsent(q);
    return q;
  };

  const invoiceInvariants = async (quotationId: string) => {
    const [{ n }] = (await query(`select count(*)::int as n from billing_invoices where quotation_id = ?`, [quotationId])) as any;
    return n as number;
  };

  beforeAll(async () => {
    orm = await getOrm();
    const now = new Date();
    await settings.savePriced(
      [
        { key: BILLING_SETTING_KEYS.installationFeeEnterprise, value: INSTALL_NGN },
        { key: BILLING_SETTING_KEYS.installationFeeOwnerOperator, value: INSTALL_NGN },
        { key: BILLING_SETTING_KEYS.defaultTaxRatePct, value: 7.5 },
      ],
      "test",
      [],
    );
    await plans.save({
      id: nextId("plan"), code: planCode, name: `${tag} Standard`, description: "Plan", perDeviceYear1Ngn: PLAN_NGN,
      perDeviceRenewalNgn: PLAN_NGN, validityDays: 365, components: ["GPS", "SIM"], lastPriceChangedAt: null,
      sortOrder: 1, isActive: true, createdAt: now, updatedAt: now,
    });
  });

  afterAll(async () => {
    await query(`delete from onboarding_payments where reference like ? or customer_name like ?`, [`${tag}%`, `${tag}%`]);
    await query(`delete from billing_invoices where customer_name like ?`, [`${tag}%`]);
    await query(`delete from billing_quotations where customer_name like ?`, [`${tag}%`]);
    await query(`delete from onboarding_applications where organization_name like ?`, [`${tag}%`]);
    await query(`delete from m2m_license_plans where code like ?`, [`${tag}%`]);
    for (const year of usedYears) await query(`delete from invoice_number_sequences where year = ?`, [year]);
    await orm.close();
  });

  it("applies every migration, including both billing ones, from an empty database", async () => {
    const cfg = getConfig();
    const dbName = `bd_empty_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await query(`create database ${dbName}`);
    const fresh = await MikroORM.init({
      entities: [new EntitySchema({ name: "Placeholder", tableName: "placeholder", properties: { id: { type: "string", primary: true } } })], host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, dbName,
      schema: "public",
      migrations: { path: "apps/auth/src/migrations", tableName: "mikro_migrations_auth", safe: true, glob: "!(*.d).{js,ts}" },
    } as never);
    try {
      await fresh.getMigrator().up();
      const run = (await fresh.em.getConnection().execute(`select name from mikro_migrations_auth`)) as Row[];
      const names = run.map((r) => String(r.name));
      expect(names).toContain("Migration20261002020000");
      expect(names).toContain("Migration20261002030000");
      const tables = (await fresh.em.getConnection().execute(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name like 'billing_%'`,
      )) as Row[];
      expect(tables.map((t) => t.table_name).sort()).toEqual(
        expect.arrayContaining(["billing_invoice_lines", "billing_invoices", "billing_quotation_lines", "billing_quotations"]),
      );
      expect(await fresh.getMigrator().getPendingMigrations()).toHaveLength(0);
    } finally {
      await fresh.close();
      await query(`drop database ${dbName} with (force)`);
    }
  });

  it("allocates unique gap-free QT and INV numbers under 30 concurrent callers", async () => {
    const year = 3000 + Math.floor(Math.random() * 5000);
    usedYears.push(year);
    const at = new Date(Date.UTC(year, 5, 15));

    const [qts, invs] = await Promise.all([
      Promise.all(Array.from({ length: 30 }, () => numbers.allocatePlatform("quotation", at))),
      Promise.all(Array.from({ length: 30 }, () => numbers.allocatePlatform("platform_subscription", at))),
    ]);

    const expected = (prefix: string, width: number) => Array.from({ length: 30 }, (_, i) => `${prefix}-${year}-${String(i + 1).padStart(width, "0")}`);
    expect(qts.map((n) => n.invoiceNumber).sort()).toEqual(expected("QT", 4));
    expect(invs.map((n) => n.invoiceNumber).sort()).toEqual(expected("INV", 3));
    expect(qts.map((n) => n.sequence).sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("creates a quotation at payment start, reuses it on a second start, and prices tax into the charge", async () => {
    const app = await seedApplication("Reuse");
    const first = (await pay().execute({ applicationId: app.id, applicationToken: app.token })).data;
    const second = (await pay().execute({ applicationId: app.id, applicationToken: app.token })).data;

    expect(second.reference).toBe(first.reference);
    expect(first.order).toMatchObject({ subtotalNgn: 80_000, taxRateBp: 750, taxNgn: 6000, totalNgn: 86_000 });
    const [{ n }] = (await query(`select count(*)::int as n from billing_quotations where application_id = ?`, [app.id])) as any;
    expect(n).toBe(1);
    const stored = (await payments.findByReference(first.reference))!;
    expect(stored.amountKobo).toBe(TOTAL_KOBO);
    const quotation = (await quotations.findById(stored.quotationId!))!;
    expect(quotation).toMatchObject({ status: "sent", totalKobo: TOTAL_KOBO, subtotalKobo: 8_000_000, taxKobo: 600_000, taxRateBp: 750 });
    expect(quotation.number).toMatch(/^QT-\d{4}-\d{4}$/);
    expect(quotation.lines.map((l) => [l.kind, l.quantity, l.unitPriceKobo])).toEqual([
      ["plan", 2, 2_500_000],
      ["installation", 2, 1_500_000],
    ]);
  });

  it("accepts the quotation and issues one linked invoice on a successful confirmation", async () => {
    sent = [];
    const started = await startPayment("Happy");

    await confirm().execute(started.reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN", channel: "card" });

    const quotation = (await quotations.findById(started.quotationId))!;
    const invoice = (await invoices.findByQuotationId(started.quotationId))!;
    expect(quotation.status).toBe("accepted");
    expect(quotation.acceptedAt).toBeInstanceOf(Date);
    expect(invoice).toMatchObject({ status: "paid", totalKobo: TOTAL_KOBO, amountPaidKobo: TOTAL_KOBO, taxKobo: 600_000 });
    expect(invoice.number).toMatch(/^INV-\d{4}-\d{3,}$/);
    expect(invoice.lines.map((l) => [l.kind, l.name, l.unitPriceKobo, l.components])).toEqual(
      quotation.lines.map((l) => [l.kind, l.name, l.unitPriceKobo, l.components]),
    );
    expect(await payments.findByReference(started.reference)).toMatchObject({ status: "paid", invoiceId: invoice.id, method: "card" });
    expect((await applications.findById(started.id))?.stage).toBe("installation_scheduling");
    expect(sent).toEqual([invoice.number]);
  });

  it("creates exactly one invoice and one accepted transition under 10 concurrent confirmations", async () => {
    sent = [];
    const started = await startPayment("Race");

    await Promise.all(
      Array.from({ length: 10 }, () => confirm().execute(started.reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" })),
    );

    expect(await invoiceInvariants(started.quotationId)).toBe(1);
    const invoice = (await invoices.findByQuotationId(started.quotationId))!;
    expect(sent).toEqual([invoice.number]);
    expect((await quotations.findById(started.quotationId))?.status).toBe("accepted");
    expect(await quotations.markAccepted(started.quotationId, new Date())).toBe(false);
    const [{ l }] = (await query(`select count(*)::int as l from billing_invoice_lines where invoice_id = ?`, [invoice.id])) as any;
    expect(l).toBe(2);
    const [{ p }] = (await query(`select count(*)::int as p from onboarding_payments where invoice_id = ?`, [invoice.id])) as any;
    expect(p).toBe(1);
  });

  it("holds a partial payment as partially_paid and completes it with the remainder", async () => {
    const q = await rawQuotation("Partial", { totalKobo: 1_000_000, subtotalKobo: 1_000_000 });
    await rawPayment("pt1", q.id, 400_000);
    await rawPayment("pt2", q.id, 600_000);

    await confirm().execute(`${tag}-pt1`, true, { amountKobo: 400_000, currency: "NGN", channel: "bank" });
    expect(await invoices.findByQuotationId(q.id)).toMatchObject({ status: "partially_paid", amountPaidKobo: 400_000 });
    expect((await quotations.findById(q.id))?.status).toBe("accepted");

    await confirm().execute(`${tag}-pt2`, true, { amountKobo: 600_000, currency: "NGN", channel: "bank" });
    const invoice = (await invoices.findByQuotationId(q.id))!;
    expect(invoice).toMatchObject({ status: "paid", amountPaidKobo: 1_000_000 });
    expect(await invoiceInvariants(q.id)).toBe(1);
    expect((await payments.findByInvoiceId(invoice.id)).map((p) => p.reference).sort()).toEqual([`${tag}-pt1`, `${tag}-pt2`]);
  });

  it("creates nothing on an amount mismatch", async () => {
    const started = await startPayment("Mismatch");

    await confirm().execute(started.reference, true, { amountKobo: TOTAL_KOBO - 1, currency: "NGN" });

    expect(await payments.findByReference(started.reference)).toMatchObject({ status: "mismatch", invoiceId: null });
    expect(await invoiceInvariants(started.quotationId)).toBe(0);
    expect((await quotations.findById(started.quotationId))?.status).toBe("sent");
    expect((await applications.findById(started.id))?.stage).toBe("payment");
  });

  it("settles a correct delivery that follows a mismatch", async () => {
    const started = await startPayment("Retry");
    await confirm().execute(started.reference, true, { amountKobo: 1, currency: "NGN" });

    await confirm().execute(started.reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN" });

    expect(await payments.findByReference(started.reference)).toMatchObject({ status: "paid" });
    expect(await invoiceInvariants(started.quotationId)).toBe(1);
  });

  it("returns correctly mapped quotation, invoice and payment lists with q, status and paging", async () => {
    const started = await startPayment("Listing");
    await confirm().execute(started.reference, true, { amountKobo: TOTAL_KOBO, currency: "NGN", channel: "bank" });
    const customer = `${tag} Listing`;

    const quoted = (await listQuotations.execute({ q: customer })).data;
    expect(quoted.total).toBe(1);
    expect(quoted.items[0]).toMatchObject({
      customerName: customer, customerType: "fleet_provider", status: "accepted", subtotalNgn: 80_000, taxNgn: 6000,
      totalNgn: 86_000, paidNgn: 86_000, outstandingNgn: 0, paymentComplete: true, lineCount: 2, taxRateBp: 750,
    });
    expect(Number.isNaN(Date.parse(quoted.items[0].validUntil))).toBe(false);
    expect((await listQuotations.execute({ q: customer, status: "accepted" })).data.total).toBe(1);
    expect((await listQuotations.execute({ q: customer, status: "sent" })).data.total).toBe(0);
    expect((await listQuotations.execute({ q: customer, paymentStatus: "incomplete" })).data.total).toBe(0);
    expect((await listQuotations.execute({ q: customer.toUpperCase(), paymentStatus: "complete" })).data.total).toBe(1);
    const detail = (await new GetQuotationUseCase(quotations, payments).execute(started.quotationId)).data;
    expect(detail.payments).toEqual([{ reference: started.reference, amountNgn: 86_000, status: "successful", paidAt: expect.any(String) }]);
    expect(detail.lines[0]).toMatchObject({ kind: "plan", quantity: 2, unitPriceNgn: 25_000, lineTotalNgn: 50_000, components: ["GPS", "SIM"] });

    const billed = (await listInvoices.execute({ q: customer })).data;
    expect(billed.total).toBe(1);
    expect(billed.items[0]).toMatchObject({
      quotationNumber: quoted.items[0].number, status: "paid", totalNgn: 86_000, amountPaidNgn: 86_000, outstandingNgn: 0,
      issueDate: lagosDate(new Date()),
    });
    expect(billed.items[0].dueDate).toBe(lagosDate(new Date(Date.now() + 15 * DAY)));
    expect((await listInvoices.execute({ q: billed.items[0].number.toLowerCase() })).data.total).toBe(1);
    expect((await listInvoices.execute({ q: customer, status: "overdue" })).data.total).toBe(0);
    const invoiceDetail = (await new GetInvoiceUseCase(invoices, payments).execute(billed.items[0].id)).data;
    expect(invoiceDetail.payments).toHaveLength(1);

    const paid = (await listPayments.execute({ q: started.reference, status: "successful", method: "bank_transfer" })).data;
    expect(paid.items[0]).toMatchObject({
      quotationNumber: quoted.items[0].number, invoiceNumber: billed.items[0].number, amountNgn: 86_000, status: "successful",
      method: "bank_transfer", customerName: customer,
    });
    expect((await listPayments.execute({ q: started.reference, status: "failed" })).data.total).toBe(0);

    const paged = (await listQuotations.execute({ q: tag, page: 2, limit: 2 })).data;
    expect(paged).toMatchObject({ page: 2, limit: 2 });
    expect(paged.items.length).toBeLessThanOrEqual(2);
    expect(paged.total).toBeGreaterThanOrEqual(3);
  });

  it("lists legacy payments that have no quotation", async () => {
    await rawPayment("lg1", null, 250_050, { status: "paid", paidAt: new Date(), customerName: null, applicationId: (await seedApplication("Legacy")).id });
    await rawPayment("lg2", null, 100_000, { status: "mismatch", customerName: `${tag} Legacy Two` });

    const all = (await listPayments.execute({ q: `${tag}-lg` })).data;

    expect(all.total).toBe(2);
    const legacy = all.items.find((i) => i.reference === `${tag}-lg1`)!;
    expect(legacy).toMatchObject({ quotationId: null, quotationNumber: null, invoiceId: null, amountNgn: 2500.5, status: "successful" });
    expect(legacy.customerName).toBe(`${tag} Legacy`);
    expect(all.items.find((i) => i.reference === `${tag}-lg2`)?.status).toBe("requires_review");
    expect((await listPayments.execute({ q: `${tag}-lg`, status: "requires_review" })).data.total).toBe(1);
  });

  describe("summary on a seeded set", () => {
    const COUNT = 300;
    const today = lagosDate(new Date());
    type Seed = { total: number; paid: number; status: InvoiceWithLines["status"]; due: string };

    const plan = (i: number): Seed => {
      const total = 100_000 + i * 137;
      const kind = i % 6;
      if (kind === 0) return { total, paid: 0, status: "issued", due: "2099-01-01" };
      if (kind === 1) return { total, paid: Math.floor(total / 4), status: "partially_paid", due: "2099-01-01" };
      if (kind === 2) return { total, paid: total, status: "paid", due: "2020-01-01" };
      if (kind === 3) return { total, paid: 0, status: "issued", due: "2020-01-01" };
      if (kind === 4) return { total, paid: Math.floor(total / 2), status: "partially_paid", due: "2020-01-01" };
      return { total, paid: 0, status: "cancelled", due: "2020-01-01" };
    };
    const seeds = Array.from({ length: COUNT }, (_, i) => plan(i));
    const open = (s: Seed) => ["issued", "partially_paid"].includes(s.status) && s.total > s.paid;

    const buildInvoice = (i: number, s: Seed): InvoiceWithLines => {
      const id = nextId("inv");
      const now = new Date();
      return {
        id, number: `${kpiTag}-${i}`, prefix: "INV", year: 2026, sequence: i, quotationId: null, applicationId: null,
        tenantId: null, customerName: `${kpiTag} Customer ${i}`, customerType: "fleet_provider", billingEmail: "a@b.com",
        status: s.status, issueDate: "2026-01-01", dueDate: s.due, subtotalKobo: s.total, discountKobo: 0, taxRateBp: 0,
        taxKobo: 0, totalKobo: s.total, amountPaidKobo: s.paid, emailedAt: null, createdAt: now, updatedAt: now, lines: [],
      };
    };

    it("matches hand-computed KPIs over 300 invoices", async () => {
      const before = await summary.totals();
      const overdueBefore = await invoices.countOverdue(today);
      for (let start = 0; start < COUNT; start += 50) {
        await Promise.all(seeds.slice(start, start + 50).map((s, k) => invoices.createIfAbsent(buildInvoice(start + k, s))));
      }
      const q1 = await rawQuotation("Q sent");
      await rawQuotation("Q draft", { status: "draft" });
      await rawQuotation("Q cancelled", { status: "cancelled" });
      await rawQuotation("Q accepted", { status: "accepted" });
      await rawPayment("kp1", q1.id, 111_111, { status: "paid", paidAt: new Date() });
      await rawPayment("kp2", null, 222_222, { status: "paid", paidAt: new Date() });
      await rawPayment("kp3", null, 999_999, { status: "pending" });
      await rawPayment("kp4", null, 888_888, { status: "failed" });
      await rawPayment("kp5", null, 777_777, { status: "mismatch" });
      const now = new Date();
      await plans.save({
        id: nextId("plan"), code: `${tag}-active2`, name: "A2", description: "d", perDeviceYear1Ngn: 1, perDeviceRenewalNgn: 1,
        validityDays: 30, components: null, lastPriceChangedAt: null, sortOrder: 9, isActive: true, createdAt: now, updatedAt: now,
      });
      await plans.save({
        id: nextId("plan"), code: `${tag}-inactive`, name: "I", description: "d", perDeviceYear1Ngn: 1, perDeviceRenewalNgn: 1,
        validityDays: 30, components: null, lastPriceChangedAt: null, sortOrder: 9, isActive: false, createdAt: now, updatedAt: now,
      });

      const after = await summary.totals();
      const outstanding = seeds.filter(open).reduce((sum, s) => sum + (s.total - s.paid), 0);
      const overdue = seeds.filter((s) => open(s) && s.due < today).length;

      expect(after.outstandingKobo - before.outstandingKobo).toBe(outstanding);
      expect(after.collectedKobo - before.collectedKobo).toBe(111_111 + 222_222);
      expect(after.quotationsCount - before.quotationsCount).toBe(2);
      expect(after.activePlans - before.activePlans).toBe(1);
      expect((await invoices.countOverdue(today)) - overdueBefore).toBe(overdue);
      expect(overdue).toBeGreaterThan(0);

      const view = (await new GetBillingSummaryUseCase(summary).execute()).data;
      expect(view.outstandingNgn).toBe(Number((after.outstandingKobo / 100).toFixed(2)));
      expect(view.collectedNgn).toBe(Number((after.collectedKobo / 100).toFixed(2)));
      expect(typeof view.quotationsCount).toBe("number");
    });

    it("derives overdue and pages through all 300 invoices", async () => {
      const everything = (await listInvoices.execute({ q: kpiTag, limit: 100 })).data;
      expect(everything.total).toBe(COUNT);
      expect(everything.items).toHaveLength(100);
      const pageThree = (await listInvoices.execute({ q: kpiTag, limit: 100, page: 3 })).data;
      expect(pageThree.items).toHaveLength(100);
      const ids = new Set<string>();
      for (const page of [1, 2, 3]) for (const item of (await listInvoices.execute({ q: kpiTag, limit: 100, page })).data.items) ids.add(item.id);
      expect(ids.size).toBe(COUNT);

      const expectOverdue = seeds.filter((s) => open(s) && s.due < today).length;
      const overdue = (await listInvoices.execute({ q: kpiTag, status: "overdue", limit: 100 })).data;
      expect(overdue.total).toBe(expectOverdue);
      expect(overdue.items.every((i) => i.status === "overdue")).toBe(true);
      const issued = (await listInvoices.execute({ q: kpiTag, status: "issued", limit: 100 })).data;
      expect(issued.total).toBe(seeds.filter((s) => s.status === "issued" && s.due >= today).length);
      const partial = (await listInvoices.execute({ q: kpiTag, status: "partially_paid", limit: 100 })).data;
      expect(partial.total).toBe(seeds.filter((s) => s.status === "partially_paid" && s.due >= today).length);
      expect((await listInvoices.execute({ q: kpiTag, status: "paid", limit: 100 })).data.total).toBe(seeds.filter((s) => s.status === "paid").length);
      expect((await listInvoices.execute({ q: kpiTag, status: "cancelled", limit: 100 })).data.total).toBe(seeds.filter((s) => s.status === "cancelled").length);

      const sample = everything.items.find((i) => i.number === `${kpiTag}-7`) ?? (await listInvoices.execute({ q: `${kpiTag}-7`, limit: 100 })).data.items.find((i) => i.number === `${kpiTag}-7`)!;
      expect(sample).toMatchObject({ totalNgn: Number(((100_000 + 7 * 137) / 100).toFixed(2)), issueDate: "2026-01-01", dueDate: "2099-01-01", status: "partially_paid" });
    });

    it("feeds the tenants summary overdue count", async () => {
      const expectedDelta = seeds.filter((s) => open(s) && s.due < today).length;
      const total = await invoices.countOverdue(today);
      const useCase = new GetSystemTenantsSummaryUseCase(
        { list: async () => [] } as never,
        { countByStatus: async () => ({}) } as never,
        invoices,
        { summary: async () => ({ inGrace: 0, pastGrace: 0 }) } as never,
        { get: async () => ({ graceDays: 3 }) } as never,
      );

      const result = await useCase.execute("token");

      expect(result.data.overdueInvoices).toBe(total);
      expect(total).toBeGreaterThanOrEqual(expectedDelta);
      expect(typeof result.data.overdueInvoices).toBe("number");
    });
  });
});
