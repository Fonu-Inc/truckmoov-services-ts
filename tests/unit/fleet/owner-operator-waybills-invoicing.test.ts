import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from "@shared/rbac";
import { WaybillsController } from "../../../apps/fleet/src/waybills.controller";
import { InvoicingController } from "../../../apps/fleet/src/invoicing.controller";
import { Waybill } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/waybill.entity";
import { PricingRule } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/entities/pricing-rule.entity";
import { InMemoryWaybillRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-waybill.repository";
import { InMemoryCustomerInvoiceRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-customer-invoice.repository";
import { InMemoryInvoiceSettingsRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-invoice-settings.repository";
import { InMemoryPricingRuleRepository } from "../../../apps/fleet/src/contexts/fleet/waybills/infrastructure/repositories/in-memory-pricing-rule.repository";
import { ListWaybillsUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/list-waybills.use-case";
import { ReviewWaybillUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/review-waybill.use-case";
import { PriceWaybillUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/price-waybill.use-case";
import { ListInvoicesUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/list-invoices.use-case";
import { GenerateInvoiceUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/generate-invoice.use-case";
import {
  ApproveInvoiceUseCase,
  MarkInvoicePaidUseCase,
  SendInvoiceUseCase,
} from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/invoice-lifecycle.use-cases";
import {
  GetInvoiceSettingsUseCase,
  SaveInvoiceSettingsUseCase,
} from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/invoice-settings.use-cases";
import { ListPricingRulesUseCase } from "../../../apps/fleet/src/contexts/fleet/waybills/application/use-cases/pricing-rule.use-cases";
import { isOnAllowedVehicle, registrationKey } from "../../../apps/fleet/src/contexts/fleet/waybills/domain/vehicle-registration";

const TENANT = "t1";
const opOne = { user: { tenantId: TENANT, userId: "op-1", role: Role.OWNER_OPERATOR } } as never;
const opTwo = { user: { tenantId: TENANT, userId: "op-2", role: Role.OWNER_OPERATOR } } as never;
const admin = { user: { tenantId: TENANT, userId: "adm", role: Role.ENTERPRISE_ADMIN } } as never;
const founder = {
  user: { tenantId: TENANT, userId: "op-1", role: Role.OWNER_OPERATOR, organizationType: OWNER_OPERATOR_ORGANISATION_TYPE },
} as never;

// One account, two independent operators: v1 is op-1's, v2 is op-2's.
const vehicles = [
  { id: "v1", plateNumber: "LAG-111AA", ownerOperatorId: "op-1" },
  { id: "v2", plateNumber: "LAG-222BB", ownerOperatorId: "op-2" },
];
const fleet = {
  execute: vi.fn(async (query: { ownerOperatorId?: string }) =>
    query.ownerOperatorId ? vehicles.filter((v) => v.ownerOperatorId === query.ownerOperatorId) : vehicles,
  ),
};

function waybill(id: string, vehicleRegistration: string | null, overrides: Partial<Parameters<typeof Waybill.create>[0]> = {}) {
  return Waybill.create({
    id, tenantId: TENANT, source: "upload", status: "priced", waybillNumber: `WB-${id}`,
    origin: "Lagos", destination: "Abuja", vehicleRegistration, customerName: "Dangote",
    priceKobo: 100_000, pricingRuleId: "rule-1", weight: 30, weightUnit: "ton", waybillDate: "2026-09-01",
    imageKey: `${TENANT}/waybills/${id}/wb.jpg`, imageSha256: "a".repeat(64), imageBytes: 100, driverId: null,
    extractedFields: {}, extractionError: null, invoiceId: null, replyChannel: "whatsapp", replyAddress: "+2348000000001",
    ...overrides,
  });
}

let kit: ReturnType<typeof harness>;

function harness() {
  const waybills = new InMemoryWaybillRepository();
  const invoices = new InMemoryCustomerInvoiceRepository();
  const settings = new InMemoryInvoiceSettingsRepository();
  const rules = new InMemoryPricingRuleRepository();
  let counter = 0;
  const runtime = { generateId: () => `id-${++counter}`, getDefaultTenantId: () => TENANT };
  const pricing = new PriceWaybillUseCase(waybills, rules);
  const recording = { auditLog: { record: vi.fn() }, bus: { publish: vi.fn() }, logger: { warn: vi.fn() } };

  const waybillsController = Object.assign(Object.create(WaybillsController.prototype), {
    ...recording,
    list: new ListWaybillsUseCase(waybills),
    waybills,
    review: new ReviewWaybillUseCase(waybills, pricing),
    listVehiclesUseCase: fleet,
  }) as WaybillsController;

  const saveRule = { execute: vi.fn() };
  const deactivateRule = { execute: vi.fn() };
  const saveSettings = { execute: vi.fn() };
  const invoicingController = Object.assign(Object.create(InvoicingController.prototype), {
    ...recording,
    listRules: new ListPricingRulesUseCase(rules),
    saveRule,
    deactivateRule,
    getSettings: new GetInvoiceSettingsUseCase(settings),
    saveSettings,
    listInvoices: new ListInvoicesUseCase(invoices),
    generate: new GenerateInvoiceUseCase(waybills, invoices, settings, runtime as never),
    approve: new ApproveInvoiceUseCase(invoices),
    send: new SendInvoiceUseCase(invoices, waybills),
    markPaid: new MarkInvoicePaidUseCase(invoices),
    listVehiclesUseCase: fleet,
  }) as InvoicingController;

  return { waybills, invoices, settings, rules, saveRule, deactivateRule, saveSettings, waybillsController, invoicingController };
}

async function seed() {
  // Spacing and case differ from the vehicle's plate on purpose: the page is read, not typed.
  await kit.waybills.save(waybill("w1", "lag 111 aa"));
  await kit.waybills.save(waybill("w2", "LAG-222BB"));
  await kit.waybills.save(waybill("w3", null, { status: "needs_review", priceKobo: null, pricingRuleId: null }));
  await new SaveInvoiceSettingsUseCase(kit.settings).execute({ tenantId: TENANT, companyName: "Host Haulage" });
}

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();

beforeEach(async () => {
  kit = harness();
  await seed();
});

describe("an owner operator's waybills", () => {
  it("lists only waybills on their own vehicles, with figures to match", async () => {
    const one = (await kit.waybillsController.listWaybills(opOne)).data;
    const two = (await kit.waybillsController.listWaybills(opTwo)).data;

    expect(ids(one.waybills)).toEqual(["w1"]);
    expect(one.summary.totalWaybills).toBe(1);
    expect(one.page.total).toBe(1);
    expect(ids(two.waybills)).toEqual(["w2"]);
  });

  it("shows an admin, and the founder of an owner-operator organisation, every waybill", async () => {
    const all = (await kit.waybillsController.listWaybills(admin)).data;
    const founders = (await kit.waybillsController.listWaybills(founder)).data;

    expect(ids(all.waybills)).toEqual(["w1", "w2", "w3"]);
    expect(all.summary.totalWaybills).toBe(3);
    expect(ids(founders.waybills)).toEqual(["w1", "w2", "w3"]);
  });

  it("reads another owner's waybill, or one on no vehicle, as not found", async () => {
    await expect(kit.waybillsController.getWaybill("w2", opOne)).rejects.toThrow(new NotFoundException("Waybill w2 not found"));
    await expect(kit.waybillsController.getWaybill("w3", opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(kit.waybillsController.getWaybill("w1", opOne)).resolves.toMatchObject({ data: { id: "w1" } });
    await expect(kit.waybillsController.getWaybill("w2", admin)).resolves.toMatchObject({ data: { id: "w2" } });
  });

  it("refuses to review another owner's waybill and leaves it alone", async () => {
    await expect(
      kit.waybillsController.reviewWaybill("w2", { customerName: "Stolen" } as never, opOne),
    ).rejects.toThrow(new NotFoundException("Waybill w2 not found"));

    expect((await kit.waybills.findById("w2", TENANT))?.customerName).toBe("Dangote");
  });

  it("refuses to move their waybill onto a vehicle that is not theirs", async () => {
    await expect(
      kit.waybillsController.reviewWaybill("w1", { vehicleRegistration: "LAG-222BB" } as never, opOne),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect((await kit.waybills.findById("w1", TENANT))?.vehicleRegistration).toBe("lag 111 aa");
  });

  it("lets them review their own, and an admin review anyone's", async () => {
    await kit.waybillsController.reviewWaybill("w1", { customerName: "BUA" } as never, opOne);
    await kit.waybillsController.reviewWaybill("w2", { customerName: "BUA" } as never, admin);

    expect((await kit.waybills.findById("w1", TENANT))?.customerName).toBe("BUA");
    expect((await kit.waybills.findById("w2", TENANT))?.customerName).toBe("BUA");
  });
});

describe("an owner operator's invoices", () => {
  async function invoiceFor(waybillId: string) {
    const created = await kit.invoicingController.generateInvoice({ waybillIds: [waybillId] }, admin);
    return created.data.id;
  }

  it("lists only invoices on their own vehicles, with figures to match", async () => {
    const mine = await invoiceFor("w1");
    const theirs = await invoiceFor("w2");

    const one = (await kit.invoicingController.invoices(opOne)).data;
    const two = (await kit.invoicingController.invoices(opTwo)).data;
    const all = (await kit.invoicingController.invoices(admin)).data;

    expect(ids(one.invoices)).toEqual([mine]);
    expect(one.summary.totalInvoices).toBe(1);
    expect(ids(two.invoices)).toEqual([theirs]);
    expect(ids(all.invoices)).toEqual([mine, theirs].sort());
  });

  it("refuses to invoice another owner's waybill and leaves it uninvoiced", async () => {
    await expect(
      kit.invoicingController.generateInvoice({ waybillIds: ["w1", "w2"] }, opOne),
    ).rejects.toThrow(new NotFoundException("Waybill w2 not found"));

    expect((await kit.waybills.findById("w1", TENANT))?.status).toBe("priced");
    expect((await kit.waybills.findById("w2", TENANT))?.status).toBe("priced");
  });

  it("lets them take their own invoice from draft to paid", async () => {
    const created = await kit.invoicingController.generateInvoice({ waybillIds: ["w1"] }, opOne);
    const id = created.data.id;

    await kit.invoicingController.approveInvoice(id, opOne);
    await kit.invoicingController.sendInvoice(id, {} as never, opOne);
    const paid = await kit.invoicingController.markInvoicePaid(id, { paidAt: "2026-09-30T00:00:00.000Z" } as never, opOne);

    expect(paid.data.paidAt).toBe("2026-09-30T00:00:00.000Z");
  });

  it("reads another owner's invoice as not found for every action", async () => {
    const theirs = await invoiceFor("w2");
    const notFound = new NotFoundException(`Invoice ${theirs} not found`);

    await expect(kit.invoicingController.approveInvoice(theirs, opOne)).rejects.toThrow(notFound);
    await kit.invoicingController.approveInvoice(theirs, admin);
    await expect(kit.invoicingController.sendInvoice(theirs, {} as never, opOne)).rejects.toThrow(notFound);
    await kit.invoicingController.sendInvoice(theirs, {} as never, admin);
    await expect(
      kit.invoicingController.markInvoicePaid(theirs, { paidAt: "2026-09-30T00:00:00.000Z" } as never, opOne),
    ).rejects.toThrow(notFound);

    expect((await kit.invoices.findById(theirs, TENANT))?.status).toBe("sent");
  });

  it("answers a missing invoice with the same not found", async () => {
    await expect(kit.invoicingController.approveInvoice("nope", admin)).rejects.toThrow(
      new NotFoundException("Invoice nope not found"),
    );
  });
});

describe("the account's pricing rules and invoice settings", () => {
  beforeEach(async () => {
    await kit.rules.save(PricingRule.create({
      id: "rule-1", tenantId: TENANT, name: "Lagos to Abuja", origin: null, destination: "Abuja",
      destinationAliases: [], mode: "flat", currency: "NGN", flatPriceKobo: 100_000, pricePerUnitKobo: null,
      unitType: null, minimumChargeKobo: null, vehicleType: null, customerName: "Dangote",
      effectiveFrom: null, effectiveTo: null, active: true,
    }));
  });

  it("are not shown to an owner operator, but are to an admin", async () => {
    const hidden = (await kit.invoicingController.pricingRules(opOne)).data;
    const shown = (await kit.invoicingController.pricingRules(admin)).data;

    expect(hidden.rules).toEqual([]);
    expect(hidden.summary.totalRules).toBe(0);
    expect(shown.rules.map((rule) => rule.id)).toEqual(["rule-1"]);
    expect((await kit.invoicingController.invoiceSettings(opOne)).data).toBeNull();
    expect((await kit.invoicingController.invoiceSettings(admin)).data).toMatchObject({ companyName: "Host Haulage" });
  });

  it("cannot be changed by an owner operator", async () => {
    const rule = { name: "x", destination: "Abuja", mode: "flat", flatPrice: 1 } as never;

    await expect(kit.invoicingController.createPricingRule(rule, opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(kit.invoicingController.updatePricingRule("rule-1", rule, opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(kit.invoicingController.deactivatePricingRule("rule-1", opOne)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      kit.invoicingController.saveInvoiceSettings({ companyName: "Mine now" } as never, opOne),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(kit.saveRule.execute).not.toHaveBeenCalled();
    expect(kit.deactivateRule.execute).not.toHaveBeenCalled();
    expect(kit.saveSettings.execute).not.toHaveBeenCalled();
  });

  it("can still be changed by an admin", async () => {
    kit.saveSettings.execute.mockResolvedValue({ companyName: "Host Haulage" });

    await kit.invoicingController.saveInvoiceSettings({ companyName: "Host Haulage" } as never, admin);

    expect(kit.saveSettings.execute).toHaveBeenCalledTimes(1);
  });
});

describe("registration matching", () => {
  it("compares plates on letters and digits alone", () => {
    expect(registrationKey(" lag-111 aa ")).toBe("LAG111AA");
    expect(isOnAllowedVehicle("LAG 111AA", new Set(["LAG111AA"]))).toBe(true);
  });

  it("puts a record with no registration outside every limit, and inside no limit", () => {
    expect(isOnAllowedVehicle(null, new Set(["LAG111AA"]))).toBe(false);
    expect(isOnAllowedVehicle(null, null)).toBe(true);
  });
});
