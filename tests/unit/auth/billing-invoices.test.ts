import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PERMISSION_CATALOG, PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { InMemoryOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";
import { InMemoryPaymentHistoryRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-payment-history.repository";
import { InMemoryBillingSummaryRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-summary.repository";
import { ConfirmApplicationPaymentUseCase } from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import { GetInvoiceUseCase, ListInvoicesUseCase } from "@auth/onboarding/application/use-cases/billing/invoice-queries.use-cases";
import { GetPaymentUseCase, ListPaymentsUseCase } from "@auth/onboarding/application/use-cases/billing/payment-queries.use-cases";
import { GetBillingSummaryUseCase } from "@auth/onboarding/application/use-cases/billing/billing-summary.use-case";
import { BillingNotFoundError, BillingValidationError } from "@auth/onboarding/domain/billing-errors";
import { addDaysToDate, lagosDate } from "@auth/onboarding/domain/invoice-dates";
import { effectiveInvoiceStatus } from "@auth/onboarding/domain/invoice.repository";
import { methodFromChannel } from "@auth/onboarding/domain/payment-method";
import { toApiPaymentStatus } from "@auth/onboarding/domain/payment-status";
import type { QuotationWithLines } from "@auth/onboarding/domain/quotation.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { PaystackGateway } from "../../../apps/auth/src/contexts/payments";
import { SystemBillingInvoicesController } from "../../../apps/auth/src/system-billing-invoices.controller";
import { buildQuotationKit } from "./quotation-test-kit";
import { buildInvoiceKit } from "./invoice-test-kit";

const DAY = 24 * 60 * 60 * 1000;
const PAID_AT = new Date("2026-10-02T23:30:00Z");
const paid = (amountKobo: number, channel: string | null = "card") => ({ amountKobo, currency: "NGN", channel });

function quotation(id: string, over: Partial<QuotationWithLines> = {}): QuotationWithLines {
  const now = new Date("2026-10-01T10:00:00Z");
  return {
    id, number: `QT-2026-${id.slice(-4).padStart(4, "0")}`, prefix: "QT", year: 2026, sequence: 1,
    applicationId: `app-${id}`, tenantId: null, planCode: "m2m_standard", deviceCount: 2,
    customerName: `Customer ${id}`, customerType: "fleet_provider", billingEmail: `${id}@acme.com`, status: "sent",
    subtotalKobo: 930_233, discountKobo: 0, taxRateBp: 750, taxKobo: 69_767, totalKobo: 1_000_000,
    validUntil: new Date(now.getTime() + 30 * DAY), sentAt: now, acceptedAt: null, createdAt: now, updatedAt: now,
    lines: [
      { id: `${id}-l1`, quotationId: id, position: 0, kind: "plan", planCode: "m2m_standard", name: "Standard", description: "d", quantity: 2, unitPriceKobo: 300_000, validityDays: 365, components: ["SIM data"], isRenewal: false },
      { id: `${id}-l2`, quotationId: id, position: 1, kind: "installation", planCode: null, name: "Installation", description: null, quantity: 2, unitPriceKobo: 165_116, validityDays: null, components: null, isRenewal: false },
    ],
    ...over,
  };
}

function payment(id: string, quotationId: string | null, amountKobo: number, over: Partial<StoredOnboardingPayment> = {}): StoredOnboardingPayment {
  const now = new Date("2026-10-02T10:00:00Z");
  return {
    id, applicationId: quotationId ? `app-${quotationId}` : "app-legacy", reference: `REF-${id}`, provider: "paystack", amountKobo,
    authorizationUrl: null, billingEmail: "a@acme.com", planCode: "m2m_standard", deviceCount: 2,
    orderSummary: null, quotationId, invoiceId: null, method: null, customerName: null, note: null, autoReconciled: true,
    status: "pending", paidAt: null, createdAt: now, updatedAt: now, ...over,
  };
}

function application(id: string, organizationName: string): StoredOnboardingApplication {
  const now = new Date();
  return {
    id, reference: `APP-${id}`, tokenHash: "x", applicantType: "fleet_provider", organizationName, businessEmail: "j@a.com",
    organizationPhone: "+2348000000000", contactFullName: "J", contactRole: null, streetAddress: "s", city: "c", state: "s",
    rcNumber: null, taxIdentificationNumber: null, identificationType: null, identificationNumber: null, m2mPlanCode: "m2m_standard",
    billingEmail: "b@a.com", billingEmailVerifiedAt: now, emailVerifiedAt: now, phoneVerifiedAt: now, status: "approved",
    stage: "payment", submittedAt: now, reviewedBy: null, reviewedAt: null, decisionReason: null, tenantId: null,
    setupLinkStatus: null, setupLinkSentAt: null, setupLinkError: null, setupLinkAttempts: 0, createdAt: now, updatedAt: now,
  };
}

function world() {
  const applications = new InMemoryOnboardingApplicationRepository();
  const payments = new InMemoryOnboardingPaymentRepository();
  const plans = new InMemoryM2mLicensePlanRepository();
  const settings = new InMemoryBillingSettingsRepository();
  const quotationKit = buildQuotationKit(plans, settings, payments);
  const kit = buildInvoiceKit({ quotations: quotationKit.repository, payments, settings });
  const confirm = new ConfirmApplicationPaymentUseCase(applications, payments, kit.service);
  const history = new InMemoryPaymentHistoryRepository(payments, quotationKit.repository, kit.invoices, applications, plans);
  const summary = new InMemoryBillingSummaryRepository(plans, quotationKit.repository, kit.invoices, payments);
  return {
    applications, payments, plans, settings, quotations: quotationKit.repository, kit, confirm, history, summary,
    listInvoices: new ListInvoicesUseCase(kit.invoices),
    getInvoice: new GetInvoiceUseCase(kit.invoices, payments),
    listPayments: new ListPaymentsUseCase(history),
    getPayment: new GetPaymentUseCase(history),
    getSummary: new GetBillingSummaryUseCase(summary),
  };
}

type World = ReturnType<typeof world>;

async function seed(w: World, q: QuotationWithLines, ...payments: StoredOnboardingPayment[]) {
  await w.quotations.createIfAbsent(q);
  for (const p of payments) await w.payments.save(p);
}

describe("invoice issued on successful settlement", () => {
  let w: World;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PAID_AT);
    w = world();
  });
  afterEach(() => vi.useRealTimers());

  it("accepts the quotation, issues one invoice and links the payment", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));

    await w.confirm.execute("REF-p1", true, paid(1_000_000, "card"));

    const invoice = (await w.kit.invoices.findByQuotationId("q1"))!;
    expect(invoice).toMatchObject({
      number: expect.stringMatching(/^INV-\d{4}-001$/),
      quotationId: "q1", applicationId: "app-q1", customerName: "Customer q1", billingEmail: "q1@acme.com",
      status: "paid", issueDate: "2026-10-03", dueDate: "2026-10-18",
      subtotalKobo: 930_233, taxRateBp: 750, taxKobo: 69_767, totalKobo: 1_000_000, amountPaidKobo: 1_000_000,
    });
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines.map((l) => l.invoiceId)).toEqual([invoice.id, invoice.id]);
    expect(invoice.lines.map((l) => l.id)).not.toContain("q1-l1");
    expect((await w.quotations.findById("q1"))).toMatchObject({ status: "accepted", acceptedAt: PAID_AT });
    expect(await w.payments.findByReference("REF-p1")).toMatchObject({ status: "paid", invoiceId: invoice.id, method: "card", autoReconciled: true });
    expect(w.kit.audit.actions()).toEqual([
      "system.billing.payment_received",
      "system.billing.quotation_accepted",
      "system.billing.invoice_issued",
    ]);
  });

  it("emails the billing address once and records emailedAt", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));

    await w.confirm.execute("REF-p1", true, paid(1_000_000));

    expect(w.kit.notifier.sent).toHaveLength(1);
    expect(w.kit.notifier.sent[0]).toMatchObject({ email: "q1@acme.com", totalNgn: 10_000, amountPaidNgn: 10_000, outstandingNgn: 0 });
    expect((await w.kit.invoices.findByQuotationId("q1"))!.emailedAt).toEqual(PAID_AT);
  });

  it("does not fail or retry the settlement when the email fails", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));
    w.kit.notifier.failWith = new Error("smtp down");

    await expect(w.confirm.execute("REF-p1", true, paid(1_000_000))).resolves.toBeUndefined();
    await w.confirm.execute("REF-p1", true, paid(1_000_000));

    expect(await w.payments.findByReference("REF-p1")).toMatchObject({ status: "paid" });
    const invoice = (await w.kit.invoices.findByQuotationId("q1"))!;
    expect(invoice.emailedAt).toBeNull();
    expect(w.kit.notifier.sent).toHaveLength(0);
  });

  it("settles even when the audit write fails", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));
    w.kit.audit.failWith = new Error("audit down");

    await expect(w.confirm.execute("REF-p1", true, paid(1_000_000))).resolves.toBeUndefined();

    expect(await w.kit.invoices.findByQuotationId("q1")).not.toBeNull();
  });

  it("creates a single invoice and number under ten concurrent confirmations", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gated = Object.create(w.payments) as InMemoryOnboardingPaymentRepository;
    gated.findByReference = async (reference: string) => {
      const snapshot = { ...(await w.payments.findByReference(reference))! };
      if (++arrived === 10) release();
      await gate;
      return snapshot;
    };
    const racing = new ConfirmApplicationPaymentUseCase(w.applications, gated, w.kit.service);

    await Promise.all(Array.from({ length: 10 }, () => racing.execute("REF-p1", true, paid(1_000_000))));

    const listed = await w.listInvoices.execute({}, PAID_AT);
    expect(listed.data.total).toBe(1);
    expect(listed.data.items[0].number).toMatch(/-001$/);
    expect(w.kit.notifier.sent).toHaveLength(1);
    expect(w.kit.audit.actions().filter((a) => a === "system.billing.invoice_issued")).toHaveLength(1);
    expect(w.kit.audit.actions().filter((a) => a === "system.billing.payment_received")).toHaveLength(1);
  });

  it("creates nothing on a replayed webhook", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));

    await w.confirm.execute("REF-p1", true, paid(1_000_000));
    vi.setSystemTime(new Date(PAID_AT.getTime() + 10 * 60_000));
    await w.confirm.execute("REF-p1", true, paid(1_000_000));
    await w.confirm.execute("REF-p1", true, paid(1_000_000));

    expect((await w.listInvoices.execute({}, PAID_AT)).data.total).toBe(1);
    expect(w.kit.notifier.sent).toHaveLength(1);
    expect(w.kit.audit.entries).toHaveLength(3);
  });

  it("finishes an unfinished settlement on a later delivery without a second invoice", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000, { status: "paid", paidAt: PAID_AT, method: "card" }));
    vi.setSystemTime(new Date(PAID_AT.getTime() + 5 * 60_000));

    await Promise.all(Array.from({ length: 10 }, () => w.confirm.execute("REF-p1", true, paid(1_000_000))));

    const invoices = await w.listInvoices.execute({}, new Date());
    expect(invoices.data.total).toBe(1);
    expect(await w.payments.findByReference("REF-p1")).toMatchObject({ invoiceId: expect.any(String) });
    expect(await w.quotations.findById("q1")).toMatchObject({ status: "accepted" });
  });

  it("leaves a paid payment alone while another delivery may still be finishing it", async () => {
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000, { status: "paid", paidAt: new Date(PAID_AT.getTime() - 5_000) }));

    await w.confirm.execute("REF-p1", true, paid(1_000_000));

    expect(await w.kit.invoices.findByQuotationId("q1")).toBeNull();
  });

  it("applies a partial payment then the rest to the same invoice", async () => {
    await seed(w, quotation("q1"), payment("pa", "q1", 400_000), payment("pb", "q1", 600_000));

    await w.confirm.execute("REF-pa", true, paid(400_000, "bank"));
    const afterFirst = (await w.kit.invoices.findByQuotationId("q1"))!;
    expect(afterFirst).toMatchObject({ status: "partially_paid", amountPaidKobo: 400_000 });

    await w.confirm.execute("REF-pb", true, paid(600_000, "mobile_money"));
    const afterSecond = (await w.kit.invoices.findByQuotationId("q1"))!;
    expect(afterSecond).toMatchObject({ id: afterFirst.id, status: "paid", amountPaidKobo: 1_000_000 });
    expect((await w.listInvoices.execute({}, PAID_AT)).data.total).toBe(1);
    expect(w.kit.notifier.sent).toHaveLength(1);

    const detail = (await w.getInvoice.execute(afterSecond.id, PAID_AT)).data;
    expect(detail.payments.map((p) => [p.reference, p.method, p.amountNgn]).sort()).toEqual([
      ["REF-pa", "bank_transfer", 4_000],
      ["REF-pb", "mtn_momo", 6_000],
    ]);
  });

  it("keeps a mismatched payment out of the invoice totals", async () => {
    await seed(w, quotation("q1"), payment("pa", "q1", 400_000), payment("pb", "q1", 600_000));
    await w.confirm.execute("REF-pa", true, paid(400_000));

    await w.confirm.execute("REF-pb", true, paid(500_000));

    expect(await w.payments.findByReference("REF-pb")).toMatchObject({ status: "mismatch", autoReconciled: false, invoiceId: null });
    expect(await w.kit.invoices.findByQuotationId("q1")).toMatchObject({ status: "partially_paid", amountPaidKobo: 400_000 });
    expect(toApiPaymentStatus("mismatch")).toBe("requires_review");
  });

  it("issues no invoice for a failed payment or one without a quotation", async () => {
    await seed(w, quotation("q1"), payment("pa", "q1", 1_000_000), payment("pl", null, 500_000));

    await w.confirm.execute("REF-pa", false, paid(1_000_000));
    await w.confirm.execute("REF-pl", true, paid(500_000));

    expect((await w.listInvoices.execute({}, PAID_AT)).data.total).toBe(0);
    expect(await w.payments.findByReference("REF-pa")).toMatchObject({ status: "failed" });
    expect(w.kit.audit.actions()).toEqual(["system.billing.payment_received"]);
  });

  it("uses the invoice due days setting", async () => {
    await w.settings.savePriced([{ key: "invoice_due_days", value: 30 }], "admin-1", []);
    await seed(w, quotation("q1"), payment("p1", "q1", 1_000_000));

    await w.confirm.execute("REF-p1", true, paid(1_000_000));

    expect((await w.kit.invoices.findByQuotationId("q1"))!).toMatchObject({ issueDate: "2026-10-03", dueDate: "2026-11-02" });
  });
});

describe("dates", () => {
  it("reads the Lagos calendar day, not the UTC one", () => {
    expect(lagosDate(new Date("2026-10-02T23:30:00Z"))).toBe("2026-10-03");
    expect(lagosDate(new Date("2026-10-02T22:59:00Z"))).toBe("2026-10-02");
  });

  it("adds days across month and year ends", () => {
    expect(addDaysToDate("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDaysToDate("2026-02-20", 15)).toBe("2026-03-07");
  });
});

describe("overdue is derived", () => {
  const base = { dueDate: "2026-10-18", totalKobo: 1000, amountPaidKobo: 400 };

  it("flags an unpaid balance past the due date", () => {
    expect(effectiveInvoiceStatus({ ...base, status: "issued" }, "2026-10-19")).toBe("overdue");
    expect(effectiveInvoiceStatus({ ...base, status: "partially_paid" }, "2026-10-19")).toBe("overdue");
  });

  it("is not overdue on the due date, when paid, or when cancelled", () => {
    expect(effectiveInvoiceStatus({ ...base, status: "issued" }, "2026-10-18")).toBe("issued");
    expect(effectiveInvoiceStatus({ ...base, status: "paid", amountPaidKobo: 1000 }, "2026-12-01")).toBe("paid");
    expect(effectiveInvoiceStatus({ ...base, status: "cancelled" }, "2026-12-01")).toBe("cancelled");
  });

  it("filters, lists and counts by the Lagos day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PAID_AT);
    const w = world();
    await seed(w, quotation("q1"), payment("pa", "q1", 400_000));
    await seed(w, quotation("q2"), payment("pb", "q2", 1_000_000));
    await w.confirm.execute("REF-pa", true, paid(400_000));
    await w.confirm.execute("REF-pb", true, paid(1_000_000));

    const early = await w.listInvoices.execute({ status: "overdue" }, new Date("2026-10-18T12:00:00Z"));
    const late = await w.listInvoices.execute({ status: "overdue" }, new Date("2026-10-19T12:00:00Z"));

    expect(early.data.total).toBe(0);
    expect(late.data.items.map((i) => [i.customerName, i.status])).toEqual([["Customer q1", "overdue"]]);
    expect((await w.listInvoices.execute({ status: "partially_paid" }, new Date("2026-10-19T12:00:00Z"))).data.total).toBe(0);
    expect(await w.kit.invoices.countOverdue("2026-10-19")).toBe(1);
    expect(await w.kit.invoices.countOverdue("2026-10-18")).toBe(0);
    vi.useRealTimers();
  });
});

describe("invoice and payment reads", () => {
  let w: World;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PAID_AT);
    w = world();
    await w.plans.save({
      id: "plan-1", code: "m2m_standard", name: "Standard", description: "d", perDeviceYear1Ngn: 25_000, perDeviceRenewalNgn: 20_000,
      validityDays: 365, components: null, lastPriceChangedAt: null, sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    await w.applications.save(application("app-legacy", "Legacy Haulage"));
    await seed(w, quotation("q1", { customerName: "Alpha Freight", createdAt: new Date("2026-10-01T10:00:00Z") }), payment("p1", "q1", 1_000_000, { orderSummary: orderSummary() }));
    await seed(w, quotation("q2", { customerName: "Beta Haulage", createdAt: new Date("2026-10-01T11:00:00Z") }), payment("p2", "q2", 1_000_000, { createdAt: new Date("2026-10-02T11:00:00Z") }));
    await w.payments.save(payment("p3", null, 500_000, { status: "paid", paidAt: new Date("2026-09-01T10:00:00Z"), createdAt: new Date("2026-09-01T09:00:00Z"), method: null }));
    await w.confirm.execute("REF-p1", true, paid(1_000_000, "card"));
    await w.confirm.execute("REF-p2", true, paid(1_000_000, "ussd"));
  });
  afterEach(() => vi.useRealTimers());

  function orderSummary() {
    return {
      planCode: "m2m_standard", planName: "Standard", deviceCount: 2, perDeviceNgn: 3_000, devicesNgn: 6_000, installationNgn: 3_302.32,
      installationPerDeviceNgn: 1_651.16, subtotalNgn: 9_302.33, taxRateBp: 750, taxNgn: 697.67, totalNgn: 10_000, renewalPerDeviceNgn: 2_000,
    };
  }

  it("lists invoices newest first with the documented row shape", async () => {
    const page = (await w.listInvoices.execute({}, PAID_AT)).data;

    expect(page.total).toBe(2);
    expect(Object.keys(page.items[0]).sort()).toEqual([
      "amountPaidNgn", "customerName", "customerType", "discountNgn", "dueDate", "emailedAt", "id", "isRenewal", "issueDate", "number",
      "outstandingNgn", "periodEnd", "quotationId", "quotationNumber", "status", "subtotalNgn", "taxNgn", "tenantId", "totalNgn",
    ]);
    expect(page.items[0]).toMatchObject({ isRenewal: false, periodEnd: null });
    expect(page.items.map((i) => i.customerName).sort()).toEqual(["Alpha Freight", "Beta Haulage"]);
    expect(page.items[0]).toMatchObject({ totalNgn: 10_000, taxNgn: 697.67, outstandingNgn: 0, amountPaidNgn: 10_000 });
  });

  it("finds invoices by number, customer or quotation number, and pages", async () => {
    const byCustomer = (await w.listInvoices.execute({ q: "alpha" }, PAID_AT)).data;
    expect(byCustomer.items.map((i) => i.customerName)).toEqual(["Alpha Freight"]);
    const byNumber = (await w.listInvoices.execute({ q: "INV-" }, PAID_AT)).data;
    expect(byNumber.total).toBe(2);
    const quotationNumber = byCustomer.items[0].quotationNumber!;
    expect((await w.listInvoices.execute({ q: quotationNumber.toLowerCase() }, PAID_AT)).data.total).toBe(1);
    expect((await w.listInvoices.execute({ q: "100%" }, PAID_AT)).data.total).toBe(0);
    const second = (await w.listInvoices.execute({ page: 2, limit: 1 }, PAID_AT)).data;
    expect(second).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(second.items).toHaveLength(1);
    expect((await w.listInvoices.execute({ status: "paid" }, PAID_AT)).data.total).toBe(2);
  });

  it("rejects an unknown invoice status and unknown ids", async () => {
    await expect(w.listInvoices.execute({ status: "bogus" })).rejects.toBeInstanceOf(BillingValidationError);
    await expect(w.getInvoice.execute("nope")).rejects.toBeInstanceOf(BillingNotFoundError);
  });

  it("returns invoice detail with lines and applied payments", async () => {
    const id = (await w.kit.invoices.findByQuotationId("q1"))!.id;

    const detail = (await w.getInvoice.execute(id, PAID_AT)).data;

    expect(detail).toMatchObject({ quotationNumber: expect.stringContaining("QT-"), billingEmail: "q1@acme.com", taxRateBp: 750 });
    expect(detail.lines.map((l) => [l.kind, l.quantity, l.unitPriceNgn, l.lineTotalNgn])).toEqual([
      ["plan", 2, 3_000, 6_000],
      ["installation", 2, 1_651.16, 3_302.32],
    ]);
    expect(detail.payments).toEqual([{ reference: "REF-p1", method: "card", amountNgn: 10_000, paidAt: PAID_AT.toISOString(), status: "successful" }]);
  });

  it("lists payments newest first, including older ones without a quotation", async () => {
    const page = (await w.listPayments.execute({})).data;

    expect(page.items.map((p) => p.reference)).toEqual(["REF-p2", "REF-p1", "REF-p3"]);
    expect(Object.keys(page.items[0]).sort()).toEqual([
      "amountNgn", "createdAt", "customerName", "deviceCount", "id", "invoiceId", "invoiceNumber", "method", "paidAt",
      "productName", "quotationId", "quotationNumber", "reference", "status",
    ]);
    const legacy = page.items[2];
    expect(legacy).toMatchObject({ quotationId: null, quotationNumber: null, invoiceId: null, invoiceNumber: null, customerName: "Legacy Haulage", productName: "Standard", status: "successful", amountNgn: 5_000, method: null });
    expect(page.items[1]).toMatchObject({ invoiceNumber: expect.stringMatching(/^INV-/), method: "card", productName: "Standard" });
    expect(page.items[0].method).toBe("other");
  });

  it("falls back to the plan code when the plan is unknown", async () => {
    await w.payments.save(payment("p4", null, 100_000, { planCode: "retired_plan", applicationId: "none", status: "paid", paidAt: new Date(), createdAt: new Date("2026-08-01T00:00:00Z") }));

    const row = (await w.listPayments.execute({ q: "REF-p4" })).data.items[0];

    expect(row).toMatchObject({ productName: "retired_plan", customerName: "" });
  });

  it("filters payments by search, status and method", async () => {
    await w.payments.save(payment("p5", null, 100_000, { status: "mismatch", createdAt: new Date("2026-10-02T12:00:00Z"), method: "bank_transfer" }));
    await w.payments.save(payment("p6", null, 100_000, { status: "requires_review", createdAt: new Date("2026-10-02T12:30:00Z") }));
    await w.payments.save(payment("p7", null, 100_000, { status: "refunded", createdAt: new Date("2026-10-02T13:00:00Z") }));

    const refs = async (input: Record<string, unknown>) => (await w.listPayments.execute(input)).data.items.map((p) => p.reference).sort();

    expect(await refs({ status: "requires_review" })).toEqual(["REF-p5", "REF-p6"]);
    expect(await refs({ status: "refunded" })).toEqual(["REF-p7"]);
    expect(await refs({ status: "successful" })).toEqual(["REF-p1", "REF-p2", "REF-p3"]);
    expect(await refs({ method: "card" })).toEqual(["REF-p1"]);
    expect(await refs({ method: "bank_transfer" })).toEqual(["REF-p5"]);
    expect(await refs({ q: "beta" })).toEqual(["REF-p2"]);
    expect(await refs({ q: "ref-p1" })).toEqual(["REF-p1"]);
    expect(await refs({ status: "successful", method: "other" })).toEqual(["REF-p2"]);
    const quotationNumber = (await w.listPayments.execute({ q: "REF-p1" })).data.items[0].quotationNumber!;
    expect(await refs({ q: quotationNumber })).toEqual(["REF-p1"]);
    await expect(w.listPayments.execute({ status: "paid" })).rejects.toBeInstanceOf(BillingValidationError);
    await expect(w.listPayments.execute({ method: "cash" })).rejects.toBeInstanceOf(BillingValidationError);
  });

  it("returns payment detail with the plan breakdown, or null for old rows", async () => {
    const rows = (await w.listPayments.execute({})).data.items;
    const withSummary = (await w.getPayment.execute(rows.find((r) => r.reference === "REF-p1")!.id)).data;
    const legacy = (await w.getPayment.execute(rows.find((r) => r.reference === "REF-p3")!.id)).data;

    expect(withSummary).toMatchObject({ provider: "paystack", autoReconciled: true, note: null, breakdown: { planName: "Standard", deviceCount: 2, installationPerDeviceNgn: 1_651.16, taxNgn: 697.67, totalNgn: 10_000 } });
    expect(legacy.breakdown).toBeNull();
    await expect(w.getPayment.execute("nope")).rejects.toBeInstanceOf(BillingNotFoundError);
  });
});

describe("billing summary", () => {
  it("computes the KPIs in naira from aggregates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PAID_AT);
    const w = world();
    const planRow = (code: string, isActive: boolean) => ({
      id: code, code, name: code, description: "d", perDeviceYear1Ngn: 1, perDeviceRenewalNgn: 1, validityDays: 365, components: null,
      lastPriceChangedAt: null, sortOrder: 1, isActive, createdAt: new Date(), updatedAt: new Date(),
    });
    await w.plans.save(planRow("a", true));
    await w.plans.save(planRow("b", true));
    await w.plans.save(planRow("c", false));
    await seed(w, quotation("q1", { totalKobo: 1_234_567 }), payment("pa", "q1", 400_001));
    await seed(w, quotation("q2", { totalKobo: 2_000_000 }), payment("pb", "q2", 2_000_000));
    await seed(w, quotation("q3", { status: "draft" }));
    await seed(w, quotation("q4", { status: "cancelled" }));
    await seed(w, quotation("q5", { status: "pending_review" }));
    await w.payments.save(payment("pl", null, 123_456, { status: "paid", paidAt: new Date() }));
    await w.payments.save(payment("pm", "q1", 999, { status: "mismatch" }));
    await w.confirm.execute("REF-pa", true, paid(400_001));
    await w.confirm.execute("REF-pb", true, paid(2_000_000));

    const summary = (await w.getSummary.execute()).data;

    expect(summary).toEqual({
      activePlans: 2,
      quotationsCount: 3,
      outstandingNgn: 8_345.66,
      collectedNgn: 25_234.57,
    });
    vi.useRealTimers();
  });
});

describe("payment channel mapping", () => {
  it.each([
    ["card", "card"], ["bank", "bank_transfer"], ["bank_transfer", "bank_transfer"], ["mobile_money", "mtn_momo"],
    ["ussd", "other"], ["other", "other"], ["qr", "other"], ["CARD", "card"],
  ])("maps %s to %s", (channel, method) => {
    expect(methodFromChannel(channel)).toBe(method);
  });

  it("returns null when the provider gave no channel", () => {
    expect(methodFromChannel(null)).toBeNull();
    expect(methodFromChannel(undefined)).toBeNull();
    expect(methodFromChannel(" ")).toBeNull();
  });

  it("reads data.channel from a Paystack callback", () => {
    const gateway = new PaystackGateway({ payment: { paystackSecretKey: "sk", paystackBaseUrl: "https://x" } } as never);
    const parse = (data: Record<string, unknown>) => gateway.parseCallback({ event: "charge.success", data: { reference: "R", ...data } });

    expect(parse({ channel: "mobile_money" })?.channel).toBe("mobile_money");
    expect(parse({})?.channel).toBeNull();
    expect(parse({ channel: 7 })?.channel).toBeNull();
  });
});

describe("billing read routes", () => {
  const proto = SystemBillingInvoicesController.prototype as unknown as Record<string, object>;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && Reflect.hasMetadata(METHOD_METADATA, proto[name]))
    .map((name) => {
      const handler = proto[name];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const requirement = (Reflect.getMetadata(REQUIREMENT_KEY, handler) ?? Reflect.getMetadata(REQUIREMENT_KEY, SystemBillingInvoicesController)) as Requirement;
      return { method, path: Reflect.getMetadata(PATH_METADATA, handler) as string, permissions: neededPermissions(requirement, method) };
    });

  it("serves only read routes in the admin portal under system/billing", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemBillingInvoicesController)).toBe("system/billing");
    expect(Reflect.getMetadata(PORTALS_KEY, SystemBillingInvoicesController)).toEqual(["admin"]);
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      "GET invoices", "GET invoices/:id", "GET payments", "GET payments/:id", "GET summary",
    ]);
  });

  it("guards every route with a catalogued read permission", () => {
    const known = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
    for (const route of routes) {
      expect(route.permissions).toEqual(["admin.billing.read"]);
      expect(known.has(route.permissions[0])).toBe(true);
    }
  });
});
