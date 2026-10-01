import { describe, expect, it } from "vitest";
import { buildRenewals, facts, PLAN, TENANT } from "./renewal-harness";

describe("renewal invoice generation", () => {
  it("issues an invoice due on the expiry date once the lead window opens", async () => {
    const h = await buildRenewals();
    h.addPeriod({ periodEnd: "2026-10-08" });

    const summary = await h.sweep();
    const [invoice] = await h.openInvoices();

    expect(summary.issued).toBe(1);
    expect(invoice).toMatchObject({
      status: "issued", tenantId: TENANT, quotationId: null, dueDate: "2026-10-08", issueDate: "2026-10-01",
      subtotalKobo: 3_000_000, discountKobo: 0, taxKobo: 0, totalKobo: 3_000_000, amountPaidKobo: 0,
      customerName: "Acme Logistics", billingEmail: "billing@acme.test",
    });
    expect(invoice.number).toMatch(/^INV-2026-/);
    expect(invoice.lines).toEqual([
      expect.objectContaining({
        kind: "plan", planCode: "m2m_standard", name: "Standard licence renewal", quantity: 5,
        unitPriceKobo: 600_000, validityDays: 365, isRenewal: true,
      }),
    ]);
    expect(h.billingAudit.actions()).toContain("system.billing.renewal_invoice_issued");
  });

  it("waits until the licence is inside the lead window", async () => {
    const h = await buildRenewals();
    h.addPeriod({ periodEnd: "2026-10-09" });
    expect((await h.sweep()).issued).toBe(0);

    h.at("2026-10-02");
    expect((await h.sweep()).issued).toBe(1);
  });

  it("honours a changed lead time", async () => {
    const h = await buildRenewals();
    await h.settings.update({ renewalLeadDays: 20 }, "test");
    h.addPeriod({ periodEnd: "2026-10-20" });
    expect((await h.sweep()).issued).toBe(1);
  });

  it("applies the configured tax rate", async () => {
    const h = await buildRenewals();
    await h.billingSettings.savePriced([{ key: "default_tax_rate_pct", value: 7.5 }], "test", []);
    h.addPeriod();
    await h.sweep();
    const [invoice] = await h.openInvoices();
    expect(invoice).toMatchObject({ taxRateBp: 750, taxKobo: 225_000, totalKobo: 3_225_000 });
  });

  it("issues exactly one invoice however often the sweep runs", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    await h.sweep();
    const [again] = await Promise.all([h.sweep(), h.sweep()]);
    expect(again.issued).toBe(0);
    expect(await h.openInvoices()).toHaveLength(1);
    expect(h.billingAudit.actions().filter((a) => a === "system.billing.renewal_invoice_issued")).toHaveLength(1);
  });

  it("makes an overdue licence due immediately, never in the past", async () => {
    const h = await buildRenewals();
    h.addPeriod({ periodEnd: "2026-09-20" });
    await h.sweep();
    expect((await h.openInvoices())[0]).toMatchObject({ issueDate: "2026-10-01", dueDate: "2026-10-01" });
  });

  it("bills the larger of purchased and installed devices", async () => {
    const h = await buildRenewals();
    h.addPeriod({ deviceCount: 5 });
    h.factsReader.byTenant.set(TENANT, facts({ fleetDeviceCount: 8 }));
    await h.sweep();
    expect((await h.openInvoices())[0]).toMatchObject({ subtotalKobo: 4_800_000 });

    const g = await buildRenewals();
    g.addPeriod({ deviceCount: 5 });
    g.factsReader.byTenant.set(TENANT, facts({ fleetDeviceCount: 2 }));
    await g.sweep();
    expect((await g.openInvoices())[0]).toMatchObject({ subtotalKobo: 3_000_000 });
  });

  it("falls back to the tenant admin email when the application has no billing email", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    h.factsReader.byTenant.set(TENANT, facts({ billingEmail: null }));
    await h.sweep();
    expect((await h.openInvoices())[0].billingEmail).toBe("admin@acme.test");
  });

  it.each([
    ["terminated", facts({ terminated: true })],
    ["has no users", facts({ hasUser: false })],
    ["has no contact", facts({ billingEmail: null, adminEmail: null })],
    ["has no devices", facts()],
  ])("skips a tenant that %s", async (label, tenantFacts) => {
    const h = await buildRenewals();
    h.addPeriod({ deviceCount: label === "has no devices" ? 0 : 5 });
    h.factsReader.byTenant.set(TENANT, tenantFacts);
    expect((await h.sweep()).issued).toBe(0);
    expect(await h.openInvoices()).toHaveLength(0);
  });

  it("skips the system tenant and a tenant whose plan row is gone", async () => {
    const h = await buildRenewals();
    h.addPeriod({ tenantId: "system" });
    h.factsReader.byTenant.set("system", facts());
    h.addPeriod({ planCode: "gone" });
    h.factsReader.byTenant.set(TENANT, facts({ applicationPlanCode: "gone" }));
    expect((await h.sweep()).issued).toBe(0);
  });

  it("still renews at the renewal price when the plan was deactivated", async () => {
    const h = await buildRenewals();
    await h.plans.save({ ...PLAN, isActive: false });
    h.addPeriod();
    expect((await h.sweep()).issued).toBe(1);
  });

  it("keeps a suspended tenant renewing", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    expect((await h.sweep()).issued).toBe(1);
  });

  it("does not let one bad tenant stop the others", async () => {
    const h = await buildRenewals();
    h.addPeriod({ tenantId: "bad", applicationId: "app-bad" });
    h.factsReader.facts = async (tenantId: string) => {
      if (tenantId === "bad") throw new Error("boom");
      return facts();
    };
    h.addPeriod();
    const summary = await h.sweep();
    expect(summary).toMatchObject({ issued: 1, failed: 1 });
  });

  it("emails the notice once with the invoice number, amount, due date and grace wording", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    await h.sweep();
    const [invoice] = await h.openInvoices();
    expect(h.mail).toHaveLength(1);
    expect(h.mail[0]).toMatchObject({
      kind: "renewal_issued", to: "admin@acme.test", invoiceNumber: invoice.number, amountOwedNgn: 30_000,
      dueDate: "2026-10-08", graceDays: 3, graceEndsOn: "2026-10-11",
    });
    expect([...h.notices.notices.keys()]).toEqual([`renewal_issued:${TENANT}:2026-10-08`]);
  });

  it("retries a failed notice on a later sweep without a second invoice", async () => {
    const h = await buildRenewals();
    h.mailer.fail = true;
    h.addPeriod();
    await h.sweep();
    expect(h.mail).toHaveLength(0);

    h.mailer.fail = false;
    await h.sweep();
    expect(h.mail).toHaveLength(1);
    expect(await h.openInvoices()).toHaveLength(1);
  });
});

describe("re-pricing before the due date", () => {
  it("updates the same invoice in place when the price changes", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    const [before] = await h.openInvoices();

    await h.plans.save({ ...PLAN, perDeviceRenewalNgn: 7_000 });
    h.at("2026-10-03");
    const summary = await h.sweep();
    const [after] = await h.openInvoices();

    expect(summary.repriced).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.number).toBe(before.number);
    expect(after.totalKobo).toBe(3_500_000);
    expect(after.lines[0].unitPriceKobo).toBe(700_000);
    expect(h.mail).toHaveLength(1);
    expect(h.billingAudit.actions()).toContain("system.billing.renewal_invoice_repriced");
  });

  it("follows a grown fleet", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    h.factsReader.byTenant.set(TENANT, facts({ fleetDeviceCount: 7 }));
    await h.sweep();
    expect((await h.openInvoices())[0].totalKobo).toBe(4_200_000);
  });

  it("freezes from the due date on", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    await h.plans.save({ ...PLAN, perDeviceRenewalNgn: 9_000 });
    h.at("2026-10-08");
    expect((await h.sweep()).repriced).toBe(0);
    expect((await h.openInvoices())[0].totalKobo).toBe(3_000_000);
  });

  it("freezes once a payment has been started", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    const [invoice] = await h.openInvoices();
    await h.gatewayPayment("RNW-x", invoice.id, 3_000_000);

    await h.plans.save({ ...PLAN, perDeviceRenewalNgn: 9_000 });
    h.at("2026-10-03");
    expect((await h.sweep()).repriced).toBe(0);
  });
});

describe("cancelling renewal invoices that no longer apply", () => {
  it("cancels and ends the period when the tenant is terminated", async () => {
    const h = await buildRenewals();
    const period = h.addPeriod();
    await h.sweep();
    h.factsReader.byTenant.set(TENANT, facts({ terminated: true }));

    expect((await h.sweep()).cancelled).toBe(1);
    expect(await h.openInvoices()).toHaveLength(0);
    expect(h.periods.all().find((p) => p.id === period.id)?.status).toBe("ended");
    expect(h.billingAudit.actions()).toContain("system.billing.renewal_invoice_cancelled");

    await h.sweep();
    expect(await h.openInvoices()).toHaveLength(0);
  });

  it("cancels on a plan change and issues a fresh invoice on the new plan next run", async () => {
    const h = await buildRenewals();
    await h.plans.save({ ...PLAN, id: "plan-2", code: "m2m_pro", name: "Pro", perDeviceRenewalNgn: 8_000 });
    const period = h.addPeriod();
    await h.sweep();
    const [first] = await h.openInvoices();
    h.factsReader.byTenant.set(TENANT, facts({ applicationPlanCode: "m2m_pro" }));

    const summary = await h.sweep();
    expect(summary).toMatchObject({ cancelled: 1, issued: 1 });
    expect(await h.invoices.findById(first.id)).toMatchObject({ status: "cancelled" });
    expect(h.periods.all().find((p) => p.id === period.id)).toMatchObject({ planCode: "m2m_pro", status: "active" });

    const [second] = await h.openInvoices();
    expect(second.id).not.toBe(first.id);
    expect(second.lines[0]).toMatchObject({ planCode: "m2m_pro", unitPriceKobo: 800_000 });
  });

  it("never cancels an invoice that has a payment, and says so once", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    await h.sweep();
    const [invoice] = await h.openInvoices();
    await h.gatewayPayment("RNW-x", invoice.id, 3_000_000);
    h.factsReader.byTenant.set(TENANT, facts({ terminated: true }));

    expect((await h.sweep()).cancelled).toBe(0);
    await h.sweep();
    expect((await h.openInvoices())).toHaveLength(1);
    expect(h.billingAudit.actions().filter((a) => a === "system.billing.renewal_cancel_blocked")).toHaveLength(1);
  });
});

describe("period seeding", () => {
  it("seeds a purchase period and backfills stale ones", async () => {
    const h = await buildRenewals();
    h.periods.seeds.push(
      { tenantId: "t-new", applicationId: "a1", planCode: "m2m_standard", quantity: 4, validityDays: 365, paidAt: new Date("2026-09-20T10:00:00Z") },
      { tenantId: "t-old", applicationId: "a2", planCode: "m2m_standard", quantity: 2, validityDays: 365, paidAt: new Date("2025-01-10T10:00:00Z") },
    );

    expect((await h.sweep()).seeded).toBe(2);
    expect(h.periods.all().filter((p) => p.tenantId.startsWith("t-"))).toEqual([
      expect.objectContaining({ tenantId: "t-new", periodEnd: "2027-09-20", origin: "purchase", deviceCount: 4 }),
      expect.objectContaining({ tenantId: "t-old", periodEnd: "2026-10-31", origin: "backfill", deviceCount: 2 }),
    ]);
    expect((await h.sweep()).seeded).toBe(0);
  });
});
