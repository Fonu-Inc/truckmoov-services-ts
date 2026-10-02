import { describe, expect, it } from "vitest";
import { billingPeriodLabel } from "@auth/onboarding/application/use-cases/billing/tenant-invoice-views";
import { matchesTenantState } from "@auth/onboarding/domain/invoice.repository";
import { storedTenantPaymentStatuses, toTenantPaymentStatus } from "@auth/onboarding/domain/payment-status";
import { tenantQuotationStatus } from "@auth/onboarding/domain/quotation.repository";

const NOW = new Date("2026-10-02T09:00:00Z");
const future = new Date("2026-11-01T00:00:00Z");

describe("billingPeriodLabel", () => {
  it("names the onboarding month for a first invoice", () => {
    expect(billingPeriodLabel({ issueDate: "2026-10-01" }, { isRenewal: false, periodEnd: null, plan: null }))
      .toBe("Onboarding (October 2026)");
  });

  it("spans the next term for a renewal", () => {
    const plan = { name: "M2M Standard", quantity: 3, validityDays: 365 };
    expect(billingPeriodLabel({ issueDate: "2026-12-01" }, { isRenewal: true, periodEnd: "2026-12-31", plan }))
      .toBe("1 Jan 2027 to 31 Dec 2027");
  });

  it("falls back to the issue month when the term is unknown", () => {
    expect(billingPeriodLabel({ issueDate: "2026-12-01" }, { isRenewal: true, periodEnd: null, plan: null }))
      .toBe("Renewal (December 2026)");
  });
});

describe("tenantQuotationStatus", () => {
  const base = { totalKobo: 100, validUntil: future };

  it("maps sent to awaiting decision and a settled accepted quotation to paid", () => {
    expect(tenantQuotationStatus({ ...base, status: "sent" }, 0, NOW)).toBe("awaiting_decision");
    expect(tenantQuotationStatus({ ...base, status: "accepted" }, 50, NOW)).toBe("accepted");
    expect(tenantQuotationStatus({ ...base, status: "accepted" }, 100, NOW)).toBe("paid");
  });

  it("reports a lapsed sent quotation as expired", () => {
    expect(tenantQuotationStatus({ ...base, status: "sent", validUntil: new Date("2026-09-01") }, 0, NOW)).toBe("expired");
  });
});

describe("tenant payment statuses", () => {
  it("shows a payment under review as pending", () => {
    expect(toTenantPaymentStatus("requires_review")).toBe("pending");
    expect(storedTenantPaymentStatuses("pending").sort()).toEqual(["mismatch", "pending", "requires_review"]);
    expect(storedTenantPaymentStatuses("successful")).toEqual(["paid"]);
  });
});

describe("matchesTenantState", () => {
  const invoice = { status: "issued" as const, dueDate: "2026-09-01", totalKobo: 100, amountPaidKobo: 0 };

  it("treats a past due unpaid invoice as overdue, not pending", () => {
    expect(matchesTenantState(invoice, "overdue", "2026-10-02")).toBe(true);
    expect(matchesTenantState(invoice, "pending", "2026-10-02")).toBe(false);
    expect(matchesTenantState({ ...invoice, dueDate: "2026-11-01" }, "pending", "2026-10-02")).toBe(true);
  });
});
