import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroQuotationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-quotation.repository";
import { MikroOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-payment.repository";
import { MikroOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-application.repository";
import { MikroInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/mikro-invoice.repository";
import { MikroPaymentHistoryRepository } from "@auth/onboarding/infrastructure/persistence/mikro-payment-history.repository";
import { MikroBillingSummaryRepository } from "@auth/onboarding/infrastructure/persistence/mikro-billing-summary.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InvoiceIssuanceService } from "@auth/onboarding/application/services/invoice-issuance.service";
import { ConfirmApplicationPaymentUseCase } from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import { lagosDate } from "@auth/onboarding/domain/invoice-dates";
import type { QuotationWithLines } from "@auth/onboarding/domain/quotation.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import { MikroInvoiceNumberRepository } from "../../apps/auth/src/mikro-invoice-number.repository";
import { InvoiceNumberService } from "../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesInvoiceNumbers } from "../../apps/auth/src/invoice-number.allocator";

type Row = Record<string, unknown>;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!dbEnabled)("invoices on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const quotations = new MikroQuotationRepository(config);
  const payments = new MikroOnboardingPaymentRepository(config);
  const invoices = new MikroInvoiceRepository(config);
  const history = new MikroPaymentHistoryRepository(config);
  const summary = new MikroBillingSummaryRepository(config);
  const tag = uniqueId("inv").slice(0, 14);
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let sent: string[] = [];
  let sendFails = false;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const service = () =>
    new InvoiceIssuanceService(
      quotations,
      invoices,
      payments,
      new InMemoryBillingSettingsRepository(),
      new InvoiceSeriesInvoiceNumbers(new InvoiceNumberService(new MikroInvoiceNumberRepository(config))),
      {
        sendInvoice: async (input) => {
          if (sendFails) throw new Error("smtp down");
          sent.push(input.invoiceNumber);
        },
      },
      { record: async () => undefined },
      { generate: () => uniqueId("i") },
    );
  const confirm = () => new ConfirmApplicationPaymentUseCase(new MikroOnboardingApplicationRepository(config), payments, service());

  const quote = async (name: string, over: Partial<QuotationWithLines> = {}): Promise<QuotationWithLines> => {
    const id = uniqueId("q");
    const now = new Date();
    const q: QuotationWithLines = {
      id, number: `QT-${tag}-${id.slice(-6)}`.slice(0, 32), prefix: "QT", year: 2026, sequence: 1,
      applicationId: uniqueId("app"), tenantId: null, planCode: "m2m_standard", deviceCount: 2,
      customerName: `${tag} ${name}`, customerType: "fleet_provider", billingEmail: "a@b.com", status: "sent",
      subtotalKobo: 930_233, discountKobo: 0, taxRateBp: 750, taxKobo: 69_767, totalKobo: 1_000_000,
      validUntil: new Date(now.getTime() + 30 * DAY), sentAt: now, acceptedAt: null, createdAt: now, updatedAt: now,
      lines: [
        { id: `${id}-1`, quotationId: id, position: 0, kind: "plan", planCode: "m2m_standard", name: "Standard", description: "d", quantity: 2, unitPriceKobo: 300_000, validityDays: 365, components: ["GPS", "SIM"], isRenewal: false },
        { id: `${id}-2`, quotationId: id, position: 1, kind: "installation", planCode: null, name: "Installation", description: null, quantity: 2, unitPriceKobo: 165_116, validityDays: null, components: null, isRenewal: false },
      ],
      ...over,
    };
    await quotations.createIfAbsent(q);
    return q;
  };

  const pay = async (suffix: string, quotationId: string | null, amountKobo: number, over: Partial<StoredOnboardingPayment> = {}) => {
    const payment: StoredOnboardingPayment = {
      id: uniqueId("p"), applicationId: uniqueId("app"), reference: `${tag}-${suffix}`, provider: "paystack", amountKobo,
      authorizationUrl: null, billingEmail: "a@b.com", planCode: "m2m_standard", deviceCount: 2, orderSummary: null,
      quotationId, invoiceId: null, method: null, customerName: `${tag} ${suffix}`, note: null, autoReconciled: true,
      status: "pending", paidAt: null, createdAt: new Date(), updatedAt: new Date(), ...over,
    };
    await payments.save(payment);
    return payment;
  };

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    await query(`delete from onboarding_payments where reference like ?`, [`${tag}%`]);
    await query(`delete from billing_invoices where customer_name like ?`, [`${tag}%`]);
    await query(`delete from billing_quotations where customer_name like ?`, [`${tag}%`]);
    await orm.close();
  });

  it("applies the migration and survives a re-run", async () => {
    const { Migration20261002030000 } = await import("../../apps/auth/src/migrations/Migration20261002030000");
    const migration = new Migration20261002030000(orm.em.getDriver(), orm.config as any) as any;
    await migration.up();
    const sqls = migration.getQueries() as string[];
    for (const sql of sqls) await query(sql);
    for (const sql of sqls) await query(sql);
    const [{ n }] = (await query(`select count(*)::int as n from mikro_migrations_auth where name = 'Migration20261002030000'`)) as any;
    expect(n).toBe(1);
  });

  it("settles into one invoice under ten concurrent deliveries and returns plain types", async () => {
    sent = [];
    const q = await quote("Concurrent");
    await pay("c1", q.id, 1_000_000);

    await Promise.all(Array.from({ length: 10 }, () => confirm().execute(`${tag}-c1`, true, { amountKobo: 1_000_000, currency: "NGN", channel: "bank" })));

    const [{ n }] = (await query(`select count(*)::int as n from billing_invoices where quotation_id = ?`, [q.id])) as any;
    expect(n).toBe(1);
    const invoice = (await invoices.findByQuotationId(q.id))!;
    expect(invoice).toMatchObject({
      status: "paid", issueDate: lagosDate(new Date()), totalKobo: 1_000_000, amountPaidKobo: 1_000_000, taxRateBp: 750,
    });
    expect(typeof invoice.totalKobo).toBe("number");
    expect(invoice.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(invoice.emailedAt).toBeInstanceOf(Date);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0].components).toEqual(["GPS", "SIM"]);
    expect(sent).toEqual([invoice.number]);
    expect(await quotations.findById(q.id)).toMatchObject({ status: "accepted" });
    expect(await payments.findByReference(`${tag}-c1`)).toMatchObject({ status: "paid", invoiceId: invoice.id, method: "bank_transfer" });
    const [{ l }] = (await query(`select count(*)::int as l from billing_invoice_lines where invoice_id = ?`, [invoice.id])) as any;
    expect(l).toBe(2);
  });

  it("keeps amount paid right when two partial payments settle at once", async () => {
    const q = await quote("Partials");
    await pay("pa", q.id, 400_000);
    await pay("pb", q.id, 600_000);

    await Promise.all([
      confirm().execute(`${tag}-pa`, true, { amountKobo: 400_000, currency: "NGN", channel: "card" }),
      confirm().execute(`${tag}-pb`, true, { amountKobo: 600_000, currency: "NGN", channel: "card" }),
    ]);

    const invoice = (await invoices.findByQuotationId(q.id))!;
    expect(invoice).toMatchObject({ status: "paid", amountPaidKobo: 1_000_000 });
    expect((await payments.findByInvoiceId(invoice.id)).map((p) => p.reference).sort()).toEqual([`${tag}-pa`, `${tag}-pb`]);
  });

  it("holds a partial payment as partially_paid and ignores a mismatched one", async () => {
    const q = await quote("Partial");
    await pay("m1", q.id, 400_000);
    await pay("m2", q.id, 600_000);

    await confirm().execute(`${tag}-m1`, true, { amountKobo: 400_000, currency: "NGN", channel: "card" });
    await confirm().execute(`${tag}-m2`, true, { amountKobo: 1, currency: "NGN", channel: "card" });

    expect(await invoices.findByQuotationId(q.id)).toMatchObject({ status: "partially_paid", amountPaidKobo: 400_000 });
    expect(await payments.findByReference(`${tag}-m2`)).toMatchObject({ status: "mismatch", autoReconciled: false, method: "card" });
  });

  it("does not fail the settlement when the email fails, and sets emailed_at only on success", async () => {
    sendFails = true;
    const q = await quote("NoMail");
    await pay("e1", q.id, 1_000_000);

    await expect(confirm().execute(`${tag}-e1`, true, { amountKobo: 1_000_000, currency: "NGN" })).resolves.toBeUndefined();
    sendFails = false;

    const invoice = (await invoices.findByQuotationId(q.id))!;
    expect(invoice.emailedAt).toBeNull();
    expect(await invoices.markEmailed(invoice.id, new Date())).toBe(true);
    expect(await invoices.markEmailed(invoice.id, new Date())).toBe(false);
  });

  it("completes a stranded settlement exactly once on concurrent later deliveries", async () => {
    const q = await quote("Stranded");
    await pay("s1", q.id, 1_000_000, { status: "paid", paidAt: new Date(Date.now() - 5 * 60_000), method: "card" });

    await Promise.all(Array.from({ length: 6 }, () => confirm().execute(`${tag}-s1`, true, { amountKobo: 1_000_000, currency: "NGN" })));

    const [{ n }] = (await query(`select count(*)::int as n from billing_invoices where quotation_id = ?`, [q.id])) as any;
    expect(n).toBe(1);
    expect((await payments.findByReference(`${tag}-s1`))?.invoiceId).not.toBeNull();
  });

  it("lists with search, derived overdue, paging and the quotation number", async () => {
    const q = await quote("Listed");
    await pay("l1", q.id, 400_000);
    await confirm().execute(`${tag}-l1`, true, { amountKobo: 400_000, currency: "NGN" });
    const invoice = (await invoices.findByQuotationId(q.id))!;
    await query(`update billing_invoices set due_date = '2020-01-01' where id = ?`, [invoice.id]);
    const today = lagosDate(new Date());

    const found = await invoices.list({ q: `${tag} Listed`, page: 1, limit: 10, today });
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({ quotationNumber: q.number, invoice: { dueDate: "2020-01-01", status: "partially_paid" } });
    expect((await invoices.list({ q: q.number.toLowerCase(), page: 1, limit: 10, today })).total).toBe(1);
    expect((await invoices.list({ q: `${tag} Listed`, status: "overdue", page: 1, limit: 10, today })).total).toBe(1);
    expect((await invoices.list({ q: `${tag} Listed`, status: "partially_paid", page: 1, limit: 10, today })).total).toBe(0);
    expect((await invoices.list({ q: `${tag} Listed`, status: "overdue", page: 1, limit: 10, today: "2019-12-31" })).total).toBe(0);
    expect((await invoices.list({ q: "100%_", page: 1, limit: 10, today })).total).toBe(0);
    expect(await invoices.countOverdue(today)).toBeGreaterThanOrEqual(1);
    expect(await invoices.findQuotationNumber(invoice.id)).toBe(q.number);
  });

  it("lists payments with legacy rows, filters and plan names", async () => {
    const q = await quote("History");
    await pay("h1", q.id, 1_000_000, { status: "paid", paidAt: new Date(), method: "card", customerName: null });
    await pay("h2", null, 500_000, { status: "paid", paidAt: new Date(), customerName: null });
    await pay("h3", null, 100_000, { status: "mismatch", customerName: `${tag} Mismatch` });
    await pay("h4", null, 100_000, { status: "refunded", customerName: `${tag} Refunded`, method: "other" });

    const all = await history.list({ q: `${tag}-h`, page: 1, limit: 10 });
    expect(all.total).toBe(4);
    const h1 = all.items.find((r) => r.payment.reference === `${tag}-h1`)!;
    expect(h1).toMatchObject({ customerName: `${tag} History`, quotationNumber: q.number, invoiceNumber: null });
    expect(typeof h1.payment.amountKobo).toBe("number");
    const h2 = all.items.find((r) => r.payment.reference === `${tag}-h2`)!;
    expect(h2.payment.quotationId).toBeNull();
    expect(h2.productName.length).toBeGreaterThan(0);

    const refs = async (filter: object) => (await history.list({ q: `${tag}-h`, page: 1, limit: 10, ...filter })).items.map((r) => r.payment.reference).sort();
    expect(await refs({ statuses: ["mismatch", "requires_review"] })).toEqual([`${tag}-h3`]);
    expect(await refs({ statuses: ["refunded"] })).toEqual([`${tag}-h4`]);
    expect(await refs({ method: "card" })).toEqual([`${tag}-h1`]);
    expect(await refs({ statuses: ["paid"], method: "card" })).toEqual([`${tag}-h1`]);
    expect((await history.list({ q: q.number, page: 1, limit: 10 })).items.map((r) => r.payment.reference)).toEqual([`${tag}-h1`]);
    expect((await history.findById(h1.payment.id))?.payment.reference).toBe(`${tag}-h1`);
    expect(await history.findById("missing")).toBeNull();
  });

  it("uses the plan name from the order summary, then the plan table, then the code", async () => {
    await pay("n1", null, 100_000, {
      status: "paid", paidAt: new Date(), planCode: "no_such_plan",
      orderSummary: { planCode: "no_such_plan", planName: "Snapshot Plan" } as never,
    });
    await pay("n2", null, 100_000, { status: "paid", paidAt: new Date(), planCode: "no_such_plan" });

    const rows = (await history.list({ q: `${tag}-n`, page: 1, limit: 10 })).items;

    expect(rows.find((r) => r.payment.reference === `${tag}-n1`)?.productName).toBe("Snapshot Plan");
    expect(rows.find((r) => r.payment.reference === `${tag}-n2`)?.productName).toBe("no_such_plan");
  });

  it("aggregates the KPIs in SQL", async () => {
    const before = await summary.totals();
    const q = await quote("Kpi", { totalKobo: 777_777, subtotalKobo: 777_777, taxKobo: 0, taxRateBp: 0 });
    await quote("KpiDraft", { status: "draft" });
    await quote("KpiCancelled", { status: "cancelled" });
    await pay("k1", q.id, 300_001);
    await pay("k2", null, 1_000, { status: "paid", paidAt: new Date() });

    await confirm().execute(`${tag}-k1`, true, { amountKobo: 300_001, currency: "NGN" });
    const after = await summary.totals();

    expect(after.quotationsCount - before.quotationsCount).toBe(1);
    expect(after.outstandingKobo - before.outstandingKobo).toBe(477_776);
    expect(after.collectedKobo - before.collectedKobo).toBe(301_001);
    expect(after.activePlans).toBeGreaterThanOrEqual(0);
    expect(typeof after.activePlans).toBe("number");
  });
});
