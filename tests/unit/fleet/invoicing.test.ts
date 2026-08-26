import { describe, expect, it } from "vitest";
import { PricingRule } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/pricing-rule.entity";
import { Waybill } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/waybill.entity";
import { applyTax } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/customer-invoice.entity";
import { InMemoryWaybillRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-waybill.repository";
import { InMemoryPricingRuleRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-pricing-rule.repository";
import { InMemoryInvoiceSettingsRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-invoice-settings.repository";
import { InMemoryCustomerInvoiceRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-customer-invoice.repository";
import { PriceWaybillUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/price-waybill.use-case";
import { GenerateInvoiceUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/generate-invoice.use-case";
import {
  ApproveInvoiceUseCase,
  MarkInvoicePaidUseCase,
  SendInvoiceUseCase,
} from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/invoice-lifecycle.use-cases";
import { SaveInvoiceSettingsUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/invoice-settings.use-cases";
import { DeactivatePricingRuleUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/pricing-rule.use-cases";

const TENANT = "tenant-1";
const NAIRA = 100;

let counter = 0;
const runtime = {
  generateId: () => `id-${++counter}`,
  getDefaultTenantId: () => TENANT,
};

function harness() {
  const waybills = new InMemoryWaybillRepository();
  const rules = new InMemoryPricingRuleRepository();
  const settings = new InMemoryInvoiceSettingsRepository();
  const invoices = new InMemoryCustomerInvoiceRepository();

  return {
    waybills,
    rules,
    settings,
    invoices,
    pricing: new PriceWaybillUseCase(waybills, rules),
    generate: new GenerateInvoiceUseCase(waybills, invoices, settings, runtime as never),
    approve: new ApproveInvoiceUseCase(invoices),
    send: new SendInvoiceUseCase(invoices, waybills),
    markPaid: new MarkInvoicePaidUseCase(invoices),
    saveSettings: new SaveInvoiceSettingsUseCase(settings),
    deactivateRule: new DeactivatePricingRuleUseCase(rules),
  };
}

async function seedSettings(kit: ReturnType<typeof harness>, overrides = {}) {
  return kit.saveSettings.execute({
    tenantId: TENANT,
    companyName: "Fonu Haulage",
    invoicePrefix: "INV",
    paymentTermsDays: 30,
    ...overrides,
  });
}

function flatRule(overrides = {}) {
  return PricingRule.create({
    id: "rule-flat",
    tenantId: TENANT,
    name: "Lagos to Abuja",
    origin: null,
    destination: "Abuja",
    destinationAliases: [],
    mode: "flat",
    currency: "NGN",
    flatPriceKobo: 500_000 * NAIRA,
    pricePerUnitKobo: null,
    unitType: null,
    minimumChargeKobo: null,
    vehicleType: null,
    customerName: null,
    effectiveFrom: null,
    effectiveTo: null,
    active: true,
    ...overrides,
  });
}

function extractedWaybill(id: string, overrides = {}) {
  return Waybill.create({
    id,
    tenantId: TENANT,
    source: "upload",
    status: "extracted",
    waybillNumber: `WB-${id}`,
    origin: "Lagos",
    destination: "Abuja",
    vehicleRegistration: "TM-556",
    customerName: "Dangote",
    priceKobo: null,
    pricingRuleId: null,
    weight: 30,
    weightUnit: "ton",
    waybillDate: "2026-02-24",
    imageKey: `${TENANT}/waybills/${id}/wb.jpg`,
    imageSha256: "a".repeat(64),
    imageBytes: 100,
    extractedFields: {},
    extractionError: null,
    invoiceId: null,
    replyChannel: "whatsapp",
    replyAddress: "+2348000000001",
    ...overrides,
  });
}

describe("Waybill pricing", () => {
  it("prices an extracted waybill and records which rule did it", async () => {
    const kit = harness();
    await kit.rules.save(flatRule());
    const waybill = extractedWaybill("w1");
    await kit.waybills.save(waybill);

    const priced = await kit.pricing.execute(waybill);

    expect(priced.status).toBe("priced");
    expect(priced.priceKobo).toBe(500_000 * NAIRA);
    expect(priced.pricingRuleId).toBe("rule-flat");
  });

  it("leaves a waybill no rule covers alone rather than pricing it at zero", async () => {
    const kit = harness();
    await kit.rules.save(flatRule({ destination: "Kano" }));
    const waybill = extractedWaybill("w1");
    await kit.waybills.save(waybill);

    const result = await kit.pricing.execute(waybill);

    // Zero is a price a tenant might genuinely charge, so it must not double as
    // "we could not work this out".
    expect(result.status).toBe("extracted");
    expect(result.priceKobo).toBeNull();
  });

  it("does not reprice a waybill after the rule is deactivated", async () => {
    const kit = harness();
    await kit.rules.save(flatRule());
    const waybill = extractedWaybill("w1");
    await kit.waybills.save(waybill);
    const priced = await kit.pricing.execute(waybill);

    await kit.deactivateRule.execute({ id: "rule-flat", tenantId: TENANT });

    const stored = await kit.waybills.findById("w1", TENANT);
    expect(stored?.priceKobo).toBe(priced.priceKobo);
    expect(stored?.status).toBe("priced");
  });
});

describe("Invoice generation", () => {
  async function pricedWaybills(kit: ReturnType<typeof harness>, ids: string[]) {
    await kit.rules.save(flatRule());
    for (const id of ids) {
      const waybill = extractedWaybill(id);
      await kit.waybills.save(waybill);
      await kit.pricing.execute(waybill);
    }
  }

  it("drafts an invoice with a draft number, not a real one", async () => {
    const kit = harness();
    await seedSettings(kit);
    await pricedWaybills(kit, ["w1"]);

    const invoice = await kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] });

    expect(invoice.status).toBe("draft");
    expect(invoice.invoiceNumber).toBe("INV-DRAFT-001");
    // A draft has not been issued, so it has no issue date and no due date.
    expect(invoice.issuedAt).toBeNull();
    expect(invoice.dueAt).toBeNull();
  });

  it("sums the waybills and marks them invoiced", async () => {
    const kit = harness();
    await seedSettings(kit);
    await pricedWaybills(kit, ["w1", "w2"]);

    const invoice = await kit.generate.execute({
      tenantId: TENANT,
      waybillIds: ["w1", "w2"],
    });

    expect(invoice.subtotalKobo).toBe(1_000_000 * NAIRA);
    for (const id of ["w1", "w2"]) {
      const waybill = await kit.waybills.findById(id, TENANT);
      expect(waybill?.status).toBe("invoiced");
      expect(waybill?.invoiceId).toBe(invoice.id);
    }
  });

  it("refuses to put a waybill on a second invoice", async () => {
    const kit = harness();
    await seedSettings(kit);
    await pricedWaybills(kit, ["w1"]);
    await kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] });

    await expect(() =>
      kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] }),
    ).rejects.toThrow("already on an invoice");
  });

  it("refuses a waybill that has no price yet", async () => {
    const kit = harness();
    await seedSettings(kit);
    await kit.waybills.save(extractedWaybill("w1"));

    await expect(() =>
      kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] }),
    ).rejects.toThrow("no price yet");
  });

  it("refuses to bill two customers on one invoice", async () => {
    const kit = harness();
    await seedSettings(kit);
    await kit.rules.save(flatRule());
    for (const [id, customer] of [["w1", "Dangote"], ["w2", "BUA"]]) {
      const waybill = extractedWaybill(id, { customerName: customer });
      await kit.waybills.save(waybill);
      await kit.pricing.execute(waybill);
    }

    await expect(() =>
      kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1", "w2"] }),
    ).rejects.toThrow("same customer");
  });

  it("adds tax when the tenant has it enabled", async () => {
    const kit = harness();
    await seedSettings(kit, { taxEnabled: true, taxRatePercent: 7.5 });
    await pricedWaybills(kit, ["w1"]);

    const invoice = await kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] });

    expect(invoice.subtotalKobo).toBe(500_000 * NAIRA);
    expect(invoice.taxKobo).toBe(37_500 * NAIRA);
    expect(invoice.totalKobo).toBe(537_500 * NAIRA);
  });

  it("refuses to invoice before the settings are filled in", async () => {
    const kit = harness();
    await pricedWaybills(kit, ["w1"]);

    await expect(() =>
      kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] }),
    ).rejects.toThrow("invoice settings");
  });
});

describe("Invoice lifecycle", () => {
  async function draftInvoice(kit: ReturnType<typeof harness>, id = "w1") {
    await seedSettings(kit);
    await kit.rules.save(flatRule());
    const waybill = extractedWaybill(id);
    await kit.waybills.save(waybill);
    await kit.pricing.execute(waybill);
    return kit.generate.execute({ tenantId: TENANT, waybillIds: [id] });
  }

  it("takes the real number at approval and sets the due date", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);

    const approved = await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });

    expect(approved.status).toBe("approved");
    expect(approved.invoiceNumber).toMatch(/^INV-\d{4}-0001$/);
    expect(approved.issuedAt).not.toBeNull();
    expect(approved.dueAt).not.toBeNull();
  });

  it("leaves no gap in the real sequence when a draft is never approved", async () => {
    const kit = harness();
    const abandoned = await draftInvoice(kit, "w1");
    const kept = await draftInvoice(kit, "w2");

    expect(abandoned.invoiceNumber).toBe("INV-DRAFT-001");
    expect(kept.invoiceNumber).toBe("INV-DRAFT-002");

    // Only the approved one consumes a real number, and it takes the first.
    const approved = await kit.approve.execute({ invoiceId: kept.id, tenantId: TENANT });
    expect(approved.invoiceNumber).toMatch(/-0001$/);
  });

  it("issues real numbers in order with no repeats", async () => {
    const kit = harness();
    const first = await draftInvoice(kit, "w1");
    const second = await draftInvoice(kit, "w2");

    const a = await kit.approve.execute({ invoiceId: first.id, tenantId: TENANT });
    const b = await kit.approve.execute({ invoiceId: second.id, tenantId: TENANT });

    expect(a.invoiceNumber).toMatch(/-0001$/);
    expect(b.invoiceNumber).toMatch(/-0002$/);
  });

  it("sends back to the address the waybill arrived from", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);
    await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });

    const sent = await kit.send.execute({ invoiceId: draft.id, tenantId: TENANT });

    expect(sent.status).toBe("sent");
    expect(sent.sentTo).toBe("+2348000000001");
  });

  it("lets the caller override the recipient", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);
    await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });

    const sent = await kit.send.execute({
      invoiceId: draft.id,
      tenantId: TENANT,
      to: "accounts@dangote.com",
    });

    expect(sent.sentTo).toBe("accounts@dangote.com");
  });

  it("refuses to send when there is no address anywhere", async () => {
    const kit = harness();
    await seedSettings(kit);
    await kit.rules.save(flatRule());
    const waybill = extractedWaybill("w1", { replyChannel: null, replyAddress: null });
    await kit.waybills.save(waybill);
    await kit.pricing.execute(waybill);
    const draft = await kit.generate.execute({ tenantId: TENANT, waybillIds: ["w1"] });
    await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });

    await expect(() =>
      kit.send.execute({ invoiceId: draft.id, tenantId: TENANT }),
    ).rejects.toThrow("no recipient");
  });

  it("will not send a draft that was never approved", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);

    await expect(() =>
      kit.send.execute({ invoiceId: draft.id, tenantId: TENANT }),
    ).rejects.toThrow("cannot go from draft to sent");
  });

  it("marks a sent invoice paid with its reference", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);
    await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });
    await kit.send.execute({ invoiceId: draft.id, tenantId: TENANT });

    const paid = await kit.markPaid.execute({
      invoiceId: draft.id,
      tenantId: TENANT,
      paidAt: "2026-03-01T00:00:00.000Z",
      reference: "TRF-99182",
    });

    expect(paid.status).toBe("paid");
    expect(paid.paymentReference).toBe("TRF-99182");
  });

  it("derives overdue from the due date rather than storing it", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);
    await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });
    const sent = await kit.send.execute({ invoiceId: draft.id, tenantId: TENANT });

    const wellPastDue = new Date(Date.parse(sent.dueAt ?? "") + 10 * 24 * 60 * 60 * 1000);

    // Nothing sweeps this. A stored flag would read as current whenever a sweep
    // missed a run.
    expect(sent.displayStatus(wellPastDue)).toBe("overdue");
    expect(sent.displayStatus(new Date(Date.parse(sent.dueAt ?? "") - 1000))).toBe("sent");
  });

  it("keeps the settings as they were when the invoice was issued", async () => {
    const kit = harness();
    const draft = await draftInvoice(kit);
    const approved = await kit.approve.execute({ invoiceId: draft.id, tenantId: TENANT });

    await kit.saveSettings.execute({
      tenantId: TENANT,
      companyName: "Renamed Ltd",
      invoicePrefix: "BILL",
      paymentTermsDays: 7,
    });

    const stored = await kit.invoices.findById(approved.id, TENANT);
    // Changing the prefix must not renumber an invoice already issued.
    expect(stored?.invoiceNumber).toBe(approved.invoiceNumber);
    expect(stored?.settingsSnapshot.companyName).toBe("Fonu Haulage");
    expect(stored?.settingsSnapshot.paymentTermsDays).toBe(30);
  });
});

describe("Tax rounding", () => {
  it("rounds once on the total rather than per line", () => {
    // Three lines that each round badly on their own still sum cleanly.
    const { taxKobo, totalKobo } = applyTax(333_33, true, 750);

    expect(taxKobo).toBe(Math.round((333_33 * 750) / 10_000));
    expect(totalKobo).toBe(333_33 + taxKobo);
  });

  it("adds nothing when tax is off", () => {
    expect(applyTax(500_000, false, 750)).toEqual({ taxKobo: 0, totalKobo: 500_000 });
  });
});
