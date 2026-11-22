import { describe, expect, it } from "vitest";
import { tenantInvoiceDetailView } from "@auth/onboarding/application/use-cases/billing/tenant-invoice-views";
import type { InvoiceWithLines } from "@auth/onboarding/domain/invoice.repository";

const invoice = {
  id: "inv-1", number: "INV-1", prefix: "INV", year: 2026, sequence: 1, quotationId: null, applicationId: "app-1",
  tenantId: "tenant-1", customerName: "Acme", customerType: "enterprise", billingEmail: "b@acme.test", status: "issued",
  issueDate: "2026-10-01", dueDate: "2026-10-08", subtotalKobo: 1_000_000, discountKobo: 200_000, taxRateBp: 750,
  taxKobo: 60_000, totalKobo: 860_000, amountPaidKobo: 0, emailedAt: null, createdAt: new Date(0), updatedAt: new Date(0),
  lines: [],
} as unknown as InvoiceWithLines;

describe("tenant invoice detail", () => {
  it("shows the discount so subtotal - discount + VAT adds up to the total", () => {
    const view = tenantInvoiceDetailView(invoice, { isRenewal: true, periodEnd: null, graceDays: 7, today: "2026-10-02" });
    expect(view).toMatchObject({ subtotalNgn: 10_000, discountNgn: 2_000, taxNgn: 600, totalNgn: 8_600 });
    expect(view.subtotalNgn - view.discountNgn + view.taxNgn).toBe(view.totalNgn);
  });
});
