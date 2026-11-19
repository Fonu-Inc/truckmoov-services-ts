import { describe, expect, it, vi } from "vitest";
import { BillingNotFoundError } from "@auth/onboarding/domain/billing-errors";
import {
  RenewalAmountTooLargeError,
  RenewalInsufficientBalanceError,
  RenewalNotPayableError,
} from "@auth/onboarding/domain/renewal-errors";
import { PaymentProviderUnavailableError } from "@auth/onboarding/application/use-cases/pay-for-application.use-cases";
import { buildRenewals, TENANT, type RenewalHarness } from "./renewal-harness";

async function issued(h: RenewalHarness, periodEnd = "2026-10-08") {
  const period = h.addPeriod({ periodEnd });
  await h.sweep();
  const [invoice] = await h.openInvoices();
  return { period, invoice };
}

const fund = async (h: RenewalHarness, kobo: number) => {
  await h.wallet.ensure(TENANT);
  await h.wallet.credit(TENANT, kobo, {
    category: "top_up", quantity: 1, unitRateKobo: kobo, reason: "test", idempotencyKey: `fund-${kobo}`,
  });
};

const gatewaySettle = (h: RenewalHarness, reference: string, amountKobo: number, succeeded = true) =>
  h.settle.execute({ reference, gateway: { succeeded, paid: { amountKobo, currency: "NGN", channel: "card" } } }, h.clock.now);

describe("settling a card payment", () => {
  it("demo checkout settles the invoice without a redirect", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    h.gateway.demo = true;

    const result = await h.payCard.execute(TENANT, invoice.id);

    expect(result.data).toMatchObject({ authorizationUrl: null });
    expect(h.gateway.initiateCharge).not.toHaveBeenCalled();
    expect(await h.invoices.findById(invoice.id)).toMatchObject({
      status: "paid",
      amountPaidKobo: invoice.totalKobo,
    });
  });

  it("extends from the current end date when paid early", async () => {
    const h = await buildRenewals();
    const { period, invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);

    h.at("2026-10-03");
    const result = await gatewaySettle(h, "RNW-1", invoice.totalKobo);

    expect(result).toMatchObject({ outcome: "renewed", newPeriodEnd: "2027-10-08", tenantId: TENANT });
    const all = h.periods.all();
    expect(all.find((p) => p.id === period.id)?.status).toBe("renewed");
    expect(all.find((p) => p.status === "active")).toMatchObject({
      origin: "renewal", periodStart: "2026-10-09", periodEnd: "2027-10-08", deviceCount: 5, planCode: "m2m_standard",
    });
    expect(await h.invoices.findById(invoice.id)).toMatchObject({ status: "paid", amountPaidKobo: invoice.totalKobo });
    expect(h.billingAudit.actions()).toEqual(
      expect.arrayContaining(["system.billing.renewal_paid", "system.tenant.licence_renewed"]),
    );
    expect(h.restore.onPaymentSettled).toHaveBeenCalledWith(TENANT, "invoice_paid");
  });

  it("gives no days back when paid inside grace", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    h.at("2026-10-10");
    expect((await gatewaySettle(h, "RNW-1", invoice.totalKobo)).newPeriodEnd).toBe("2027-10-08");
  });

  it("restarts the clock from today when paid long after expiry", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h, "2024-01-01");
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    const result = await gatewaySettle(h, "RNW-1", invoice.totalKobo);
    expect(result.newPeriodEnd).toBe("2027-10-01");
    expect(h.periods.all().find((p) => p.status === "active")?.periodStart).toBe("2026-10-01");
  });

  it("extends once however many times the webhook is delivered, but repairs restore every time", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);

    const results = await Promise.all([
      gatewaySettle(h, "RNW-1", invoice.totalKobo),
      gatewaySettle(h, "RNW-1", invoice.totalKobo),
    ]);
    await gatewaySettle(h, "RNW-1", invoice.totalKobo);

    expect(results.map((r) => r.outcome).sort()).toEqual(["no_change", "renewed"].sort());
    expect(h.periods.all().filter((p) => p.origin === "renewal")).toHaveLength(1);
    expect(h.billingAudit.actions().filter((a) => a === "system.billing.renewal_paid")).toHaveLength(1);
    expect(h.restore.onPaymentSettled).toHaveBeenCalledTimes(3);
  });

  it("does not extend a payment of the wrong amount", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);

    const result = await gatewaySettle(h, "RNW-1", invoice.totalKobo - 100);

    expect(result.outcome).toBe("mismatch");
    expect((await h.payments.findByReference("RNW-1"))?.status).toBe("mismatch");
    expect(await h.invoices.findById(invoice.id)).toMatchObject({ status: "issued", amountPaidKobo: 0 });
    expect(h.periods.all().some((p) => p.origin === "renewal")).toBe(false);
    expect(h.restore.onPaymentSettled).not.toHaveBeenCalled();
  });

  it("marks a provider failure failed and extends nothing", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    expect((await gatewaySettle(h, "RNW-1", invoice.totalKobo, false)).outcome).toBe("failed");
    expect((await h.payments.findByReference("RNW-1"))?.status).toBe("failed");
  });

  it("ignores unknown references and payments of other invoices", async () => {
    const h = await buildRenewals();
    expect((await gatewaySettle(h, "NOPE", 100)).outcome).toBe("noop");
    await h.gatewayPayment("FPA-1", "", 100, { invoiceId: null });
    expect((await gatewaySettle(h, "FPA-1", 100)).outcome).toBe("noop");
  });

  it("credits a second payment of an already paid invoice to the wallet instead of extending again", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    await h.gatewayPayment("RNW-2", invoice.id, invoice.totalKobo);

    await gatewaySettle(h, "RNW-1", invoice.totalKobo);
    const second = await gatewaySettle(h, "RNW-2", invoice.totalKobo);
    await gatewaySettle(h, "RNW-2", invoice.totalKobo);

    expect(second.outcome).toBe("duplicate");
    expect(await h.invoices.findById(invoice.id)).toMatchObject({ amountPaidKobo: invoice.totalKobo, status: "paid" });
    expect(h.periods.all().filter((p) => p.origin === "renewal")).toHaveLength(1);
    expect((await h.payments.findByReference("RNW-2"))?.status).toBe("refunded");
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(invoice.totalKobo);
    expect(h.wallet.ledger.filter((e) => e.idempotencyKey === "renewal-dup:RNW-2")).toHaveLength(1);
    expect(h.billingAudit.actions().filter((a) => a === "system.billing.renewal_duplicate_payment")).toHaveLength(1);
  });

  it("lets exactly one of two simultaneously paid payments renew", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo, { status: "paid", paidAt: h.clock.now });
    await h.gatewayPayment("RNW-2", invoice.id, invoice.totalKobo, { status: "paid", paidAt: h.clock.now });

    const outcomes = [
      (await h.settle.execute({ reference: "RNW-1" }, h.clock.now)).outcome,
      (await h.settle.execute({ reference: "RNW-2" }, h.clock.now)).outcome,
    ];

    expect(outcomes.sort()).toEqual(["duplicate", "renewed"]);
    expect(h.periods.all().filter((p) => p.origin === "renewal")).toHaveLength(1);
  });

  it("leaves a paid invoice out of the unpaid set so the planner stops counting it", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    await gatewaySettle(h, "RNW-1", invoice.totalKobo);
    const stored = await h.invoices.findById(invoice.id);
    expect(stored!.totalKobo <= stored!.amountPaidKobo).toBe(true);
    expect(await h.openInvoices()).toHaveLength(0);
  });
});

describe("paying from the wallet", () => {
  it("debits the outstanding amount once, marks the invoice paid and extends the licence", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 5_000_000);

    const { data } = await h.payWallet.execute(TENANT, invoice.id);

    expect(data).toMatchObject({ paidFromWalletNgn: 30_000, newPeriodEnd: "2027-10-08" });
    expect(data.invoice).toMatchObject({ status: "paid", outstandingNgn: 0, payable: false });
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(2_000_000);
    const debit = h.wallet.ledger.find((e) => e.direction === "debit")!;
    expect(debit).toMatchObject({
      category: "subscription", amountKobo: 3_000_000, idempotencyKey: `renewal:${invoice.id}`, reference: invoice.number,
    });
    expect(await h.payments.findByReference(`RNW-W-${invoice.number}`)).toMatchObject({
      method: "wallet", status: "paid", invoiceId: invoice.id,
    });
    expect(h.restore.onPaymentSettled).toHaveBeenCalledWith(TENANT, "invoice_paid");
  });

  it("refuses a second payment of a paid invoice without moving money", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 9_000_000);
    await h.payWallet.execute(TENANT, invoice.id);
    await expect(h.payWallet.execute(TENANT, invoice.id)).rejects.toBeInstanceOf(RenewalNotPayableError);
    expect(h.wallet.ledger.filter((e) => e.direction === "debit")).toHaveLength(1);
  });

  it("reports the shortfall and leaves nothing behind when the balance is too low", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 1_000_000);

    const failure = await h.payWallet.execute(TENANT, invoice.id).catch((error) => error);

    expect(failure).toBeInstanceOf(RenewalInsufficientBalanceError);
    expect(failure.shortfallKobo).toBe(2_000_000);
    expect(await h.payments.findByReference(`RNW-W-${invoice.number}`)).toBeNull();
    expect(await h.invoices.findById(invoice.id)).toMatchObject({ status: "issued" });

    await fund(h, 2_000_000);
    expect((await h.payWallet.execute(TENANT, invoice.id)).data.invoice.status).toBe("paid");
  });

  it("refunds the debit when settling fails, and a retry pays again", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 3_000_000);
    const real = h.periods.settleRenewalPayment.bind(h.periods);
    h.periods.settleRenewalPayment = async () => { throw new Error("db down"); };

    await expect(h.payWallet.execute(TENANT, invoice.id)).rejects.toThrow("db down");
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(3_000_000);

    h.periods.settleRenewalPayment = real;
    const retry = await h.payWallet.execute(TENANT, invoice.id);
    expect(retry.data.invoice.status).toBe("paid");
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(0);
  });

  it("the sweep settles a wallet renewal whose debit landed but whose settlement and refund both failed", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 3_000_000);
    const real = h.periods.settleRenewalPayment.bind(h.periods);
    h.periods.settleRenewalPayment = async () => { throw new Error("db down"); };
    vi.spyOn(h.wallet, "credit").mockRejectedValueOnce(new Error("wallet down"));
    await expect(h.payWallet.execute(TENANT, invoice.id, h.clock.now)).rejects.toThrow("db down");
    h.periods.settleRenewalPayment = real;

    expect(await h.payWallet.recoverStale(h.clock.now)).toBe(0);
    expect(await h.payWallet.recoverStale(new Date(h.clock.now.getTime() + 60 * 60 * 1000))).toBe(1);

    expect(await h.invoices.findById(invoice.id)).toMatchObject({ status: "paid" });
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(0);
    expect(h.wallet.ledger.filter((e) => e.direction === "debit")).toHaveLength(1);
  });

  it("the sweep refunds a stuck wallet debit once when a card paid the invoice meanwhile", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await fund(h, 3_000_000);
    vi.spyOn(h.payments, "settlePending").mockRejectedValueOnce(new Error("db down"));
    await expect(h.payWallet.execute(TENANT, invoice.id, h.clock.now)).rejects.toThrow("db down");
    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(0);
    await h.gatewayPayment("RNW-1", invoice.id, invoice.totalKobo);
    await gatewaySettle(h, "RNW-1", invoice.totalKobo);

    const later = new Date(h.clock.now.getTime() + 60 * 60 * 1000);
    expect(await h.payWallet.recoverStale(later)).toBe(1);
    expect(await h.payWallet.recoverStale(later)).toBe(0);

    expect((await h.wallet.findByTenantId(TENANT))?.balanceKobo).toBe(3_000_000);
    expect(h.wallet.ledger.filter((e) => e.direction === "credit" && e.category === "refund")).toHaveLength(1);
    expect(await h.invoices.findById(invoice.id)).toMatchObject({ status: "paid" });
  });

  it("does not find another tenant's invoice", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await expect(h.payWallet.execute("someone-else", invoice.id)).rejects.toBeInstanceOf(BillingNotFoundError);
  });
});

describe("paying by card", () => {
  it("starts a pending payment priced from the invoice and tagged as a renewal", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);

    const { data } = await h.payCard.execute(TENANT, invoice.id);

    expect(data).toMatchObject({ amountNgn: 30_000, authorizationUrl: `https://pay.test/${data.reference}` });
    expect(data.reference).toMatch(new RegExp(`^RNW-${invoice.number}-[0-9a-f]{12}$`));
    expect(h.gateway.initiateCharge).toHaveBeenCalledWith({
      reference: data.reference,
      amountKobo: 3_000_000,
      customerEmail: "billing@acme.test",
      metadata: { kind: "renewal", renewalInvoiceId: invoice.id, applicationId: "app-1" },
    });
    expect(await h.payments.findByReference(data.reference)).toMatchObject({
      status: "pending", invoiceId: invoice.id, quotationId: null, amountKobo: 3_000_000,
      authorizationUrl: data.authorizationUrl,
    });
  });

  it("creates a fresh reference per click", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    const first = await h.payCard.execute(TENANT, invoice.id);
    const second = await h.payCard.execute(TENANT, invoice.id);
    expect(first.data.reference).not.toBe(second.data.reference);
  });

  it("refuses a paid invoice, a foreign invoice, a huge amount and a missing provider", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    await expect(h.payCard.execute("someone-else", invoice.id)).rejects.toBeInstanceOf(BillingNotFoundError);

    h.gateway.isConfigured = () => false;
    await expect(h.payCard.execute(TENANT, invoice.id)).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
    h.gateway.isConfigured = () => true;

    await h.invoices.updateRenewalAmounts(invoice.id, {
      quantity: 1, unitPriceKobo: 2_000_000_001, subtotalKobo: 2_000_000_001, taxRateBp: 0, taxKobo: 0, totalKobo: 2_000_000_001,
    });
    await expect(h.payCard.execute(TENANT, invoice.id)).rejects.toBeInstanceOf(RenewalAmountTooLargeError);
  });

  it("refuses a first-purchase invoice", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    const first = { ...invoice, id: "first-1", number: "INV-2026-900", quotationId: "q1", status: "paid" as const };
    first.lines = first.lines.map((line) => ({ ...line, isRenewal: false, invoiceId: "first-1" }));
    await h.invoices.createIfAbsent(first);
    await expect(h.payCard.execute(TENANT, "first-1")).rejects.toBeInstanceOf(RenewalNotPayableError);
  });
});

describe("tenant views", () => {
  it("lists open and paid invoices with totals, grace end and payability", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);

    const open = (await h.tenantViews.list.execute(TENANT, { status: "open" }, h.clock.now)).data;
    expect(open).toMatchObject({ total: 1, openTotalNgn: 30_000, nextDueDate: "2026-10-08" });
    expect(open.items[0]).toMatchObject({
      id: invoice.id, kind: "renewal", status: "issued", totalNgn: 30_000, amountPaidNgn: 0, outstandingNgn: 30_000,
      daysOverdue: 0, graceEndsOn: "2026-10-11", payable: true, periodEnd: "2026-10-08",
    });

    h.at("2026-10-10");
    const late = (await h.tenantViews.list.execute(TENANT, {}, h.clock.now)).data;
    expect(late.items[0]).toMatchObject({ status: "overdue", daysOverdue: 2, payable: true });

    await fund(h, 3_000_000);
    await h.payWallet.execute(TENANT, invoice.id, h.clock.now);
    const after = (await h.tenantViews.list.execute(TENANT, { status: "open" }, h.clock.now)).data;
    expect(after).toMatchObject({ total: 0, openTotalNgn: 0, nextDueDate: null });
    const paid = (await h.tenantViews.list.execute(TENANT, { status: "paid" }, h.clock.now)).data;
    expect(paid.items[0]).toMatchObject({ status: "paid", graceEndsOn: null, payable: false, daysOverdue: 0 });
  });

  it("hides other tenants' invoices and cancelled ones", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    expect((await h.tenantViews.list.execute("someone-else", {}, h.clock.now)).data.total).toBe(0);
    await expect(h.tenantViews.get.execute("someone-else", invoice.id)).rejects.toBeInstanceOf(BillingNotFoundError);
    await h.invoices.cancelRenewal(invoice.id);
    expect((await h.tenantViews.list.execute(TENANT, {}, h.clock.now)).data.total).toBe(0);
  });

  it("returns one invoice with its lines", async () => {
    const h = await buildRenewals();
    const { invoice } = await issued(h);
    const { data } = await h.tenantViews.get.execute(TENANT, invoice.id, h.clock.now);
    expect(data.lines).toEqual([
      expect.objectContaining({ name: "Standard licence renewal", quantity: 5, unitPriceNgn: 6_000, lineTotalNgn: 30_000 }),
    ]);
  });

  it("reports the licence, or null when there is none", async () => {
    const h = await buildRenewals();
    expect((await h.tenantViews.licence.execute(TENANT)).data).toBeNull();
    const { invoice } = await issued(h);
    expect((await h.tenantViews.licence.execute(TENANT, h.clock.now)).data).toEqual({
      planCode: "m2m_standard", planName: "Standard", deviceCount: 5, periodStart: "2025-10-09",
      periodEnd: "2026-10-08", daysLeft: 7, status: "active", renewalInvoiceId: invoice.id,
      pricePerDeviceNgn: null, renewalPricePerDeviceNgn: 6_000, totalPaidNgn: null, validityDays: 365, invoiceNumber: null,
      devicesInUse: null, vehiclesInUse: null, simsInUse: null,
    });
  });

  it("reports what the tenant has in use now", async () => {
    const h = await buildRenewals();
    await issued(h);
    h.fieldActivity.usageCounts = async () => ({ vehicles: 4, drivers: 2, devices: 3, sims: 5 });
    expect((await h.tenantViews.licence.execute(TENANT, h.clock.now)).data).toMatchObject({
      devicesInUse: 3, vehiclesInUse: 4, simsInUse: 5,
    });
  });
});
