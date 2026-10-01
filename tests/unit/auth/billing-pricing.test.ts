import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { CreateLicensePlanUseCase } from "@auth/onboarding/application/use-cases/billing/create-license-plan.use-case";
import {
  GetInstallationPriceUseCase,
  UpdateInstallationPriceUseCase,
} from "@auth/onboarding/application/use-cases/billing/installation-price.use-cases";
import {
  GetLicensePlanUseCase,
  ListLicensePlansUseCase,
} from "@auth/onboarding/application/use-cases/billing/list-license-plans.use-cases";
import { ListPriceChangesUseCase } from "@auth/onboarding/application/use-cases/billing/list-price-changes.use-case";
import { SetLicensePlanActiveUseCase } from "@auth/onboarding/application/use-cases/billing/set-license-plan-active.use-case";
import { UpdateLicensePlanUseCase } from "@auth/onboarding/application/use-cases/billing/update-license-plan.use-case";
import { loadInstallationFees } from "@auth/onboarding/application/use-cases/support/installation-fees";
import {
  BillingConflictError,
  BillingNotFoundError,
  BillingValidationError,
} from "@auth/onboarding/domain/billing-errors";
import { lagosToday } from "@auth/onboarding/domain/billing-pricing";
import {
  buildOrderSummary,
  installationFeeFor,
} from "@auth/onboarding/domain/onboarding-order";
import type {
  BillingActor,
  BillingAudit,
  BillingAuditEntry,
} from "@auth/onboarding/domain/ports/billing-audit.port";
import {
  M2mLicensePlansBootstrapService,
  M2M_LICENSE_PLAN_SEEDS,
} from "@auth/onboarding/infrastructure/bootstrap/m2m-license-plans-bootstrap.service";
import { InMemoryBillingPriceChangeRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-price-change.repository";
import { InMemoryBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-billing-settings.repository";
import { InMemoryM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-m2m-license-plan.repository";

const ACTOR: BillingActor = {
  userId: "admin-1",
  name: "Ada Admin",
  email: "ada@truckmoov.test",
  role: "FINANCE",
  tenantId: "system",
};

class RecordingAudit implements BillingAudit {
  entries: BillingAuditEntry[] = [];
  async record(_actor: BillingActor, entry: BillingAuditEntry) {
    this.entries.push(entry);
  }
}

const NEW_PLAN = {
  code: "m2m_pro",
  name: "M2M Pro",
  perDeviceYear1Ngn: 90_000,
  perDeviceRenewalNgn: 60_000,
};

function tomorrow(): string {
  const date = new Date(`${lagosToday(new Date())}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe("Licence plan administration", () => {
  let history: InMemoryBillingPriceChangeRepository;
  let plans: InMemoryM2mLicensePlanRepository;
  let audit: RecordingAudit;
  let create: CreateLicensePlanUseCase;
  let update: UpdateLicensePlanUseCase;
  let setActive: SetLicensePlanActiveUseCase;
  let list: ListLicensePlansUseCase;
  let get: GetLicensePlanUseCase;
  let changes: ListPriceChangesUseCase;

  beforeEach(() => {
    history = new InMemoryBillingPriceChangeRepository();
    plans = new InMemoryM2mLicensePlanRepository(history);
    audit = new RecordingAudit();
    let n = 0;
    const ids = { generate: () => `id-${++n}` };
    create = new CreateLicensePlanUseCase(plans, ids, audit);
    update = new UpdateLicensePlanUseCase(plans, ids, audit);
    setActive = new SetLicensePlanActiveUseCase(plans, audit);
    list = new ListLicensePlansUseCase(plans);
    get = new GetLicensePlanUseCase(plans, history);
    changes = new ListPriceChangesUseCase(history);
  });

  describe("create", () => {
    it("creates a plan with defaults and records the activity", async () => {
      const result = await create.execute(ACTOR, NEW_PLAN);

      expect(result.data.plan).toMatchObject({
        code: "m2m_pro",
        validityDays: 365,
        components: [],
        isActive: true,
        sortOrder: 1,
        lastPriceChangedAt: null,
      });
      expect(audit.entries.map((e) => e.action)).toEqual(["system.billing.plan_created"]);
    });

    it("refuses a duplicate code", async () => {
      await create.execute(ACTOR, NEW_PLAN);

      await expect(create.execute(ACTOR, NEW_PLAN)).rejects.toBeInstanceOf(BillingConflictError);
    });

    it.each([
      ["a missing name", { name: " " }],
      ["a bad code", { code: "Not A Code" }],
      ["a zero price", { perDeviceYear1Ngn: 0 }],
      ["a fractional price", { perDeviceRenewalNgn: 10.5 }],
      ["zero validity", { validityDays: 0 }],
      ["blank components", { components: ["ok", " "] }],
    ])("refuses %s", async (_label, override) => {
      await expect(create.execute(ACTOR, { ...NEW_PLAN, ...override })).rejects.toBeInstanceOf(
        BillingValidationError,
      );
      expect(await plans.findByCode("m2m_pro")).toBeNull();
    });
  });

  describe("price changes", () => {
    beforeEach(async () => {
      await create.execute(ACTOR, NEW_PLAN);
      audit.entries = [];
    });

    it("appends one history row per changed price with the actor and writes one activity entry", async () => {
      const result = await update.execute(ACTOR, "m2m_pro", {
        perDeviceYear1Ngn: 95_000,
        perDeviceRenewalNgn: 55_000,
        reason: "Carrier cost increase",
      });

      expect(result.data.plan.perDeviceYear1Ngn).toBe(95_000);
      expect(result.data.plan.lastPriceChangedAt).not.toBeNull();
      const { items } = await history.list({ page: 1, limit: 10 });
      expect(items).toHaveLength(2);
      expect(items.find((c) => c.field === "year1")).toMatchObject({
        itemType: "m2m_plan",
        itemRef: "m2m_pro",
        oldPriceNgn: 90_000,
        newPriceNgn: 95_000,
        reason: "Carrier cost increase",
        effectiveDate: lagosToday(new Date()),
        changedByUserId: "admin-1",
        changedByName: "Ada Admin",
      });
      expect(audit.entries.map((e) => e.action)).toEqual(["system.billing.plan_price_changed"]);
    });

    it("treats the same price as a no-op even without a reason", async () => {
      const result = await update.execute(ACTOR, "m2m_pro", { perDeviceYear1Ngn: 90_000 });

      expect(result.data.priceChanges).toEqual([]);
      expect((await history.list({ page: 1, limit: 10 })).total).toBe(0);
      expect(audit.entries).toEqual([]);
      expect((await plans.findByCode("m2m_pro"))!.lastPriceChangedAt).toBeNull();
    });

    it("requires a reason for a real change and leaves the plan untouched", async () => {
      await expect(
        update.execute(ACTOR, "m2m_pro", { perDeviceYear1Ngn: 95_000 }),
      ).rejects.toBeInstanceOf(BillingValidationError);

      expect((await plans.findByCode("m2m_pro"))!.perDeviceYear1Ngn).toBe(90_000);
      expect((await history.list({ page: 1, limit: 10 })).total).toBe(0);
    });

    it("refuses a future effective date and accepts a past one", async () => {
      await expect(
        update.execute(ACTOR, "m2m_pro", {
          perDeviceYear1Ngn: 95_000,
          reason: "r",
          effectiveDate: tomorrow(),
        }),
      ).rejects.toBeInstanceOf(BillingValidationError);

      await update.execute(ACTOR, "m2m_pro", {
        perDeviceYear1Ngn: 95_000,
        reason: "Backdated correction",
        effectiveDate: "2026-01-15",
      });
      const { items } = await history.list({ page: 1, limit: 10 });
      expect(items[0].effectiveDate).toBe("2026-01-15");
    });

    it.each(["2026-13-40", "15/01/2026", "tomorrow"])("refuses the malformed date %s", async (effectiveDate) => {
      await expect(
        update.execute(ACTOR, "m2m_pro", { perDeviceYear1Ngn: 95_000, reason: "r", effectiveDate }),
      ).rejects.toBeInstanceOf(BillingValidationError);
    });

    it.each([0, -5, 1.5, "100"])("refuses the price %s", async (price) => {
      await expect(
        update.execute(ACTOR, "m2m_pro", { perDeviceYear1Ngn: price, reason: "r" }),
      ).rejects.toBeInstanceOf(BillingValidationError);
    });

    it("edits name, validity and components without touching price history", async () => {
      const result = await update.execute(ACTOR, "m2m_pro", {
        name: "M2M Professional",
        validityDays: 730,
        components: ["GPS tracking", "Fuel sensor"],
      });

      expect(result.data.plan).toMatchObject({
        name: "M2M Professional",
        validityDays: 730,
        components: ["GPS tracking", "Fuel sensor"],
      });
      expect((await history.list({ page: 1, limit: 10 })).total).toBe(0);
      expect(audit.entries.map((e) => e.action)).toEqual(["system.billing.plan_updated"]);
    });

    it("answers not found for an unknown plan", async () => {
      await expect(update.execute(ACTOR, "nope", { name: "x" })).rejects.toBeInstanceOf(BillingNotFoundError);
    });

    it("shows recent history on the plan and filters the history list", async () => {
      await update.execute(ACTOR, "m2m_pro", { perDeviceYear1Ngn: 95_000, reason: "r" });
      await create.execute(ACTOR, { ...NEW_PLAN, code: "other" });
      await update.execute(ACTOR, "other", { perDeviceYear1Ngn: 91_000, reason: "r" });

      const detail = await get.execute("m2m_pro");
      expect(detail.data.priceHistory).toHaveLength(1);
      expect((await changes.execute({ itemRef: "other" })).data.total).toBe(1);
      expect((await changes.execute({ itemType: "installation_fee" })).data.total).toBe(0);
      expect((await changes.execute({ limit: 1 })).data).toMatchObject({ total: 2, limit: 1 });
      await expect(get.execute("nope")).rejects.toBeInstanceOf(BillingNotFoundError);
    });
  });

  describe("activation", () => {
    beforeEach(async () => {
      await create.execute(ACTOR, NEW_PLAN);
      audit.entries = [];
    });

    it("deactivates and reactivates idempotently, logging only real changes", async () => {
      await setActive.execute(ACTOR, "m2m_pro", false);
      await setActive.execute(ACTOR, "m2m_pro", false);
      expect((await plans.findByCode("m2m_pro"))!.isActive).toBe(false);
      await setActive.execute(ACTOR, "m2m_pro", true);
      await setActive.execute(ACTOR, "m2m_pro", true);

      expect(audit.entries.map((e) => e.action)).toEqual([
        "system.billing.plan_deactivated",
        "system.billing.plan_activated",
      ]);
    });

    it("lists inactive plans for admins but not on the public catalogue", async () => {
      await setActive.execute(ACTOR, "m2m_pro", false);

      expect((await list.execute({})).data.items.map((p) => p.code)).toEqual(["m2m_pro"]);
      expect((await list.execute({ status: "active" })).data.total).toBe(0);
      expect((await list.execute({ status: "inactive" })).data.total).toBe(1);
      expect(await plans.findActive()).toEqual([]);
    });

    it("searches by name or code and pages", async () => {
      await create.execute(ACTOR, { ...NEW_PLAN, code: "second", name: "Second Plan" });

      expect((await list.execute({ q: "SECOND" })).data.items.map((p) => p.code)).toEqual(["second"]);
      const page = await list.execute({ page: 2, limit: 1 });
      expect(page.data).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(page.data.items.map((p) => p.code)).toEqual(["second"]);
    });

    it("answers not found for an unknown plan", async () => {
      await expect(setActive.execute(ACTOR, "nope", true)).rejects.toBeInstanceOf(BillingNotFoundError);
    });
  });

  it("offers no way to delete a plan", () => {
    expect(Object.getOwnPropertyNames(InMemoryM2mLicensePlanRepository.prototype)).not.toContain("delete");
  });
});

describe("Licence plan bootstrap", () => {
  it("seeds missing plans once", async () => {
    const plans = new InMemoryM2mLicensePlanRepository();
    const bootstrap = new M2mLicensePlansBootstrapService(plans);

    await bootstrap.onApplicationBootstrap();
    await bootstrap.onApplicationBootstrap();

    expect((await plans.list({ page: 1, limit: 50 })).total).toBe(M2M_LICENSE_PLAN_SEEDS.length);
  });

  it("never overwrites an edited price, name, state or components", async () => {
    const history = new InMemoryBillingPriceChangeRepository();
    const plans = new InMemoryM2mLicensePlanRepository(history);
    const bootstrap = new M2mLicensePlansBootstrapService(plans);
    await bootstrap.onApplicationBootstrap();
    const update = new UpdateLicensePlanUseCase(plans, { generate: () => "h-1" }, new RecordingAudit());
    await update.execute(ACTOR, "m2m_standard", {
      name: "Renamed",
      perDeviceYear1Ngn: 81_000,
      perDeviceRenewalNgn: 71_000,
      components: ["Kept"],
      reason: "Repriced",
    });
    await new SetLicensePlanActiveUseCase(plans, new RecordingAudit()).execute(ACTOR, "m2m_advance", false);

    await bootstrap.onApplicationBootstrap();

    expect(await plans.findByCode("m2m_standard")).toMatchObject({
      name: "Renamed",
      perDeviceYear1Ngn: 81_000,
      perDeviceRenewalNgn: 71_000,
      components: ["Kept"],
    });
    expect((await plans.findByCode("m2m_advance"))!.isActive).toBe(false);
  });
});

describe("Installation price", () => {
  let history: InMemoryBillingPriceChangeRepository;
  let settings: InMemoryBillingSettingsRepository;
  let audit: RecordingAudit;
  let get: GetInstallationPriceUseCase;
  let update: UpdateInstallationPriceUseCase;

  beforeEach(() => {
    history = new InMemoryBillingPriceChangeRepository();
    settings = new InMemoryBillingSettingsRepository(history);
    audit = new RecordingAudit();
    let n = 0;
    get = new GetInstallationPriceUseCase(settings, history);
    update = new UpdateInstallationPriceUseCase(settings, history, { generate: () => `c-${++n}` }, audit);
  });

  it("reads the live 15,000 when nothing has been stored", async () => {
    expect((await get.execute()).data).toMatchObject({
      enterpriseNgn: 15_000,
      ownerOperatorNgn: 15_000,
      lastChangedAt: null,
      priceHistory: [],
    });
  });

  it("writes history only for the audience that changed, plus one activity entry", async () => {
    const result = await update.execute(ACTOR, {
      enterpriseNgn: 15_000,
      ownerOperatorNgn: 12_000,
      reason: "Owner operator promotion",
    });

    expect(result.data).toMatchObject({ enterpriseNgn: 15_000, ownerOperatorNgn: 12_000 });
    expect(result.data.lastChangedAt).not.toBeNull();
    expect(result.data.priceHistory).toHaveLength(1);
    expect(result.data.priceHistory[0]).toMatchObject({
      itemType: "installation_fee",
      itemRef: "installation_fee",
      field: "owner_operator",
      oldPriceNgn: 15_000,
      newPriceNgn: 12_000,
      changedByName: "Ada Admin",
    });
    expect(audit.entries.map((e) => e.action)).toEqual(["system.billing.installation_price_changed"]);
  });

  it("is a no-op when both prices match, with no reason needed", async () => {
    await update.execute(ACTOR, { enterpriseNgn: 15_000, ownerOperatorNgn: 15_000 });

    expect((await history.list({ page: 1, limit: 10 })).total).toBe(0);
    expect(audit.entries).toEqual([]);
  });

  it.each([
    ["a missing reason", { enterpriseNgn: 20_000, ownerOperatorNgn: 15_000 }],
    ["a zero price", { enterpriseNgn: 0, ownerOperatorNgn: 15_000, reason: "r" }],
    ["a fractional price", { enterpriseNgn: 20_000, ownerOperatorNgn: 1.5, reason: "r" }],
    ["a future date", { enterpriseNgn: 20_000, ownerOperatorNgn: 15_000, reason: "r", effectiveDate: tomorrow() }],
  ])("refuses %s and stores nothing", async (_label, input) => {
    await expect(update.execute(ACTOR, input)).rejects.toBeInstanceOf(BillingValidationError);

    expect((await loadInstallationFees(settings)).enterpriseNgn).toBe(15_000);
    expect((await history.list({ page: 1, limit: 10 })).total).toBe(0);
  });
});

describe("Order pricing by audience", () => {
  const plan = {
    id: "p",
    code: "m2m_standard",
    name: "Standard",
    description: "",
    perDeviceYear1Ngn: 77_000,
    perDeviceRenewalNgn: 75_000,
    validityDays: 365,
    components: null,
    lastPriceChangedAt: null,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const fees = { enterpriseNgn: 20_000, ownerOperatorNgn: 9_000 };

  it("charges owner operators their price and every other applicant the enterprise price", () => {
    expect(installationFeeFor("owner_operator", fees)).toBe(9_000);
    expect(installationFeeFor("fleet_provider", fees)).toBe(20_000);
    expect(installationFeeFor("enterprise" as never, fees)).toBe(20_000);
    expect(installationFeeFor("aggregator" as never, fees)).toBe(20_000);
  });

  it("prices installation per device from the fee passed in", () => {
    const summary = buildOrderSummary(plan, 3, installationFeeFor("owner_operator", fees));

    expect(summary.installationNgn).toBe(27_000);
    expect(summary.totalNgn).toBe(77_000 * 3 + 27_000);
  });

  it("falls back to 15,000 only for settings that are missing", async () => {
    const settings = new InMemoryBillingSettingsRepository();
    await settings.savePriced([{ key: "installation_fee_owner_operator_ngn", value: 9_000 }], "a", []);

    expect(await loadInstallationFees(settings)).toEqual({ enterpriseNgn: 15_000, ownerOperatorNgn: 9_000 });
  });
});
