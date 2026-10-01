import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroM2mLicensePlanRepository } from "../../apps/auth/src/contexts/onboarding/infrastructure/persistence/mikro-m2m-license-plan.repository";
import { MikroBillingSettingsRepository } from "../../apps/auth/src/contexts/onboarding/infrastructure/persistence/mikro-billing-settings.repository";
import { MikroBillingPriceChangeRepository } from "../../apps/auth/src/contexts/onboarding/infrastructure/persistence/mikro-billing-price-change.repository";
import { M2mLicensePlansBootstrapService } from "../../apps/auth/src/contexts/onboarding/infrastructure/bootstrap/m2m-license-plans-bootstrap.service";
import { UpdateLicensePlanUseCase } from "../../apps/auth/src/contexts/onboarding/application/use-cases/billing/update-license-plan.use-case";
import { SetLicensePlanActiveUseCase } from "../../apps/auth/src/contexts/onboarding/application/use-cases/billing/set-license-plan-active.use-case";
import {
  GetInstallationPriceUseCase,
  UpdateInstallationPriceUseCase,
} from "../../apps/auth/src/contexts/onboarding/application/use-cases/billing/installation-price.use-cases";
import { GetApplicationOrderUseCase } from "../../apps/auth/src/contexts/onboarding/application/use-cases/pay-for-application.use-cases";
import { BILLING_SETTING_KEYS } from "../../apps/auth/src/contexts/onboarding/domain/billing-settings.repository";
import type { StoredM2mLicensePlan } from "../../apps/auth/src/contexts/onboarding/domain/m2m-license-plan.repository";
import type { StoredBillingPriceChange } from "../../apps/auth/src/contexts/onboarding/domain/billing-price-change.repository";

type Row = Record<string, unknown>;

const actor = { userId: "u-1", name: "Admin", email: null, role: "PLATFORM_ADMIN", tenantId: "t-1" };

describe.skipIf(!dbEnabled)("billing plans on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const plans = new MikroM2mLicensePlanRepository(config);
  const settings = new MikroBillingSettingsRepository(config);
  const history = new MikroBillingPriceChangeRepository(config);
  const audited: string[] = [];
  const audit = { record: async (_a: unknown, e: { action: string }) => void audited.push(e.action) };
  let seq = 0;
  const ids = { generate: () => `${uniqueId("pc")}-${seq++}` };
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let originalSettings: Row[];
  let originalSeeds: Row[];

  const query = (sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const newPlan = (over: Partial<StoredM2mLicensePlan> = {}): StoredM2mLicensePlan => {
    const code = uniqueId("plan").replace(/-/g, "_").toLowerCase().slice(0, 60);
    const now = new Date();
    return {
      id: uniqueId("id"),
      code,
      name: "Test plan",
      description: "d",
      perDeviceYear1Ngn: 1000,
      perDeviceRenewalNgn: 800,
      validityDays: 365,
      components: null,
      lastPriceChangedAt: null,
      sortOrder: 9000,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...over,
    };
  };

  const change = (itemRef: string, over: Partial<StoredBillingPriceChange> = {}): StoredBillingPriceChange => ({
    id: uniqueId("h"),
    itemType: "m2m_plan",
    itemRef,
    field: "year1",
    oldPriceNgn: 1000,
    newPriceNgn: 1500,
    effectiveDate: "2026-10-01",
    reason: "test",
    changedByUserId: "u-1",
    changedByName: "Admin",
    createdAt: new Date(),
    ...over,
  });

  const historyFor = (code: string) =>
    query(`select * from billing_price_changes where item_ref = ? order by created_at`, [code]);

  const makeUpdate = () => new UpdateLicensePlanUseCase(plans, ids, audit as any);

  beforeAll(async () => {
    orm = await getOrm();
    originalSettings = await query(`select * from billing_settings`);
    originalSeeds = await query(`select * from m2m_license_plans where code in ('m2m_standard','m2m_advance')`);
  });

  afterAll(async () => {
    if (!orm) return;
    for (const s of originalSettings) {
      await query(
        `insert into billing_settings (key, value_json) values (?, ?::jsonb)
         on conflict (key) do update set value_json = excluded.value_json`,
        [s.key, JSON.stringify(s.value_json)],
      );
    }
    for (const p of originalSeeds) {
      await query(
        `update m2m_license_plans set per_device_year1_ngn = ?, per_device_renewal_ngn = ? where code = ?`,
        [p.per_device_year1_ngn, p.per_device_renewal_ngn, p.code],
      );
    }
    await query(`delete from billing_price_changes where item_ref like 'plan\\_%' or item_ref = 'installation_fee'`);
    await query(`delete from m2m_license_plans where code like 'plan\\_%'`);
    await orm.close();
  });

  describe("migration", () => {
    it("whole chain applied, new objects exist", async () => {
      const [{ n }] = (await query(
        `select count(*)::int as n from mikro_migrations_auth where name = 'Migration20261002010000'`,
      )) as any;
      expect(n).toBe(1);
      const cols = await query(
        `select column_name from information_schema.columns where table_name = 'm2m_license_plans'
         and column_name in ('validity_days','components','last_price_changed_at')`,
      );
      expect(cols).toHaveLength(3);
      const pay = await query(
        `select data_type from information_schema.columns where table_name = 'onboarding_payments' and column_name = 'order_summary'`,
      );
      expect(pay[0]?.data_type).toBe("jsonb");
    });

    it("re-running up is a no-op that keeps edited data", async () => {
      const { Migration20261002010000 } = await import("../../apps/auth/src/migrations/Migration20261002010000");
      const plan = newPlan({ components: ["a", "b"], validityDays: 90 });
      await plans.save(plan);
      await query(`update billing_settings set value_json = '21000'::jsonb where key = ?`, [
        BILLING_SETTING_KEYS.installationFeeEnterprise,
      ]);

      const migration = new Migration20261002010000(orm.em.getDriver(), orm.config as any) as any;
      await migration.up();
      const sqls = migration.getQueries() as string[];
      for (const sql of sqls) await query(sql);
      for (const sql of sqls) await query(sql);

      const after = await plans.findByCode(plan.code);
      expect(after?.components).toEqual(["a", "b"]);
      expect(after?.validityDays).toBe(90);
      const [fee] = await query(`select value_json from billing_settings where key = ?`, [
        BILLING_SETTING_KEYS.installationFeeEnterprise,
      ]);
      expect(Number(fee.value_json)).toBe(21000);
    });
  });

  describe("plans crud", () => {
    it("round-trips components jsonb and plain numbers", async () => {
      const plan = newPlan({ components: ["GPS", "SIM"], validityDays: 180 });
      expect(await plans.insertIfMissing(plan)).toBe(true);
      expect(await plans.insertIfMissing({ ...plan, id: uniqueId("id") })).toBe(false);

      const found = await plans.findByCode(plan.code);
      expect(found).toMatchObject({
        code: plan.code,
        components: ["GPS", "SIM"],
        validityDays: 180,
        perDeviceYear1Ngn: 1000,
        perDeviceRenewalNgn: 800,
        lastPriceChangedAt: null,
        isActive: true,
      });
      expect(typeof found!.perDeviceYear1Ngn).toBe("number");
      expect(typeof found!.sortOrder).toBe("number");

      await plans.save({ ...found!, components: ["only"], name: "Renamed" });
      const again = await plans.findByCode(plan.code);
      expect(again).toMatchObject({ name: "Renamed", components: ["only"] });
    });

    it("pre-existing row without new columns reads validity 365 and null components", async () => {
      const code = uniqueId("plan").replace(/-/g, "_").toLowerCase().slice(0, 60);
      await query(
        `insert into m2m_license_plans (id, code, name, description, per_device_year1_ngn, per_device_renewal_ngn, sort_order, is_active)
         values (?, ?, 'Old', '', 500, 400, 9001, true)`,
        [uniqueId("id"), code],
      );
      const found = await plans.findByCode(code);
      expect(found).toMatchObject({ validityDays: 365, components: null, lastPriceChangedAt: null });
    });

    it("list filters by status and query and paginates", async () => {
      const a = newPlan({ name: "Zeta searchable", isActive: false });
      await plans.save(a);
      const inactive = await plans.list({ status: "inactive", q: "searchable", page: 1, limit: 10 });
      expect(inactive.items.map((p) => p.code)).toContain(a.code);
      expect(inactive.total).toBeGreaterThanOrEqual(1);
      const active = await plans.list({ status: "active", q: a.code, page: 1, limit: 10 });
      expect(active.items).toHaveLength(0);
      expect(await plans.nextSortOrder()).toBeGreaterThan(9000);
    });
  });

  describe("price history", () => {
    it("a price change writes exactly one history row with the plan update", async () => {
      const plan = newPlan();
      await plans.save(plan);
      audited.length = 0;
      const result = await makeUpdate().execute(actor, plan.code, {
        perDeviceYear1Ngn: 1500,
        reason: "inflation",
      });
      expect(result.status).toBe(true);

      const rows = await historyFor(plan.code);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        item_type: "m2m_plan",
        field: "year1",
        reason: "inflation",
        changed_by_user_id: "u-1",
      });
      expect(Number(rows[0].old_price_ngn)).toBe(1000);
      expect(Number(rows[0].new_price_ngn)).toBe(1500);
      const stored = await plans.findByCode(plan.code);
      expect(stored?.perDeviceYear1Ngn).toBe(1500);
      expect(stored?.lastPriceChangedAt).toBeInstanceOf(Date);
      expect(audited).toEqual(["system.billing.plan_price_changed"]);

      const listed = await history.list({ itemType: "m2m_plan", itemRef: plan.code, page: 1, limit: 10 });
      expect(listed.total).toBe(1);
      expect(listed.items[0]).toMatchObject({ field: "year1", oldPriceNgn: 1000, newPriceNgn: 1500 });
      expect(listed.items[0].effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("both prices changed write two rows; non-price edit writes none", async () => {
      const plan = newPlan();
      await plans.save(plan);
      await makeUpdate().execute(actor, plan.code, {
        perDeviceYear1Ngn: 2000,
        perDeviceRenewalNgn: 900,
        reason: "r",
      });
      expect(await historyFor(plan.code)).toHaveLength(2);
      await makeUpdate().execute(actor, plan.code, { name: "Just a rename", components: ["x"] });
      expect(await historyFor(plan.code)).toHaveLength(2);
      expect((await plans.findByCode(plan.code))?.name).toBe("Just a rename");
    });

    it("failing history insert rolls the plan update back", async () => {
      const plan = newPlan();
      await plans.save(plan);
      const bad = change(plan.code, { reason: "x".repeat(600) });

      await expect(
        plans.savePriced({ ...plan, perDeviceYear1Ngn: 7777, name: "Changed" }, [bad]),
      ).rejects.toThrow();

      const stored = await plans.findByCode(plan.code);
      expect(stored?.perDeviceYear1Ngn).toBe(1000);
      expect(stored?.name).toBe("Test plan");
      expect(await historyFor(plan.code)).toHaveLength(0);
    });

    it("duplicate history id also rolls back the plan update", async () => {
      const plan = newPlan();
      await plans.save(plan);
      const first = change(plan.code);
      await plans.savePriced({ ...plan, perDeviceYear1Ngn: 1500 }, [first]);
      await expect(
        plans.savePriced({ ...plan, perDeviceYear1Ngn: 1800 }, [first]),
      ).rejects.toThrow();
      expect((await plans.findByCode(plan.code))?.perDeviceYear1Ngn).toBe(1500);
      expect(await historyFor(plan.code)).toHaveLength(1);
    });

    it("concurrent price edits on one plan lose no history row", async () => {
      const plan = newPlan();
      await plans.save(plan);
      const results = await Promise.allSettled(
        [1100, 1200, 1300, 1400, 1500].map((price) =>
          makeUpdate().execute(actor, plan.code, { perDeviceYear1Ngn: price, reason: `to ${price}` }),
        ),
      );
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const rows = await historyFor(plan.code);
      expect(rows).toHaveLength(5);
      expect(new Set(rows.map((r) => Number(r.new_price_ngn)))).toEqual(new Set([1100, 1200, 1300, 1400, 1500]));
      const final = (await plans.findByCode(plan.code))!.perDeviceYear1Ngn;
      expect([1100, 1200, 1300, 1400, 1500]).toContain(final);
    });

    it("two concurrent edits chain old -> mid -> new with no duplicated old price", async () => {
      const plan = newPlan();
      await plans.save(plan);
      await Promise.all(
        [1500, 2000].map((price) =>
          makeUpdate().execute(actor, plan.code, { perDeviceYear1Ngn: price, reason: `to ${price}` }),
        ),
      );

      const rows = await historyFor(plan.code);
      expect(rows).toHaveLength(2);
      const olds = rows.map((r) => Number(r.old_price_ngn));
      const news = rows.map((r) => Number(r.new_price_ngn));
      expect(olds).toContain(1000);
      expect(new Set(olds).size).toBe(2);
      const first = rows.find((r) => Number(r.old_price_ngn) === 1000)!;
      const second = rows.find((r) => r !== first)!;
      expect(Number(second.old_price_ngn)).toBe(Number(first.new_price_ngn));
      expect((await plans.findByCode(plan.code))!.perDeviceYear1Ngn).toBe(Number(second.new_price_ngn));
      expect(new Set(news)).toEqual(new Set([1500, 2000]));
    });

    it("concurrent edit to the same price writes history once", async () => {
      const plan = newPlan();
      await plans.save(plan);
      await Promise.all(
        [0, 1].map(() => makeUpdate().execute(actor, plan.code, { perDeviceYear1Ngn: 1700, reason: "same" })),
      );
      expect(await historyFor(plan.code)).toHaveLength(1);
    });

    it("concurrent savePriced on one plan keeps every history row", async () => {
      const plan = newPlan();
      await plans.save(plan);
      await Promise.all(
        [1, 2, 3, 4].map((n) =>
          plans.savePriced({ ...plan, perDeviceYear1Ngn: 1000 + n }, [change(plan.code, { newPriceNgn: 1000 + n })]),
        ),
      );
      expect(await historyFor(plan.code)).toHaveLength(4);
    });
  });

  describe("activate and deactivate", () => {
    it("are idempotent and leave no price history", async () => {
      const plan = newPlan();
      await plans.save(plan);
      const toggle = new SetLicensePlanActiveUseCase(plans, audit as any);
      audited.length = 0;

      await toggle.execute(actor, plan.code, false);
      await toggle.execute(actor, plan.code, false);
      expect((await plans.findByCode(plan.code))?.isActive).toBe(false);
      expect((await plans.findActive()).map((p) => p.code)).not.toContain(plan.code);

      await toggle.execute(actor, plan.code, true);
      await toggle.execute(actor, plan.code, true);
      expect((await plans.findByCode(plan.code))?.isActive).toBe(true);
      expect((await plans.findActive()).map((p) => p.code)).toContain(plan.code);

      expect(audited).toEqual(["system.billing.plan_deactivated", "system.billing.plan_activated"]);
      expect(await historyFor(plan.code)).toHaveLength(0);
    });

    it("unknown plan is not found", async () => {
      const toggle = new SetLicensePlanActiveUseCase(plans, audit as any);
      await expect(toggle.execute(actor, "nope_nope", true)).rejects.toThrow(/not found/i);
    });
  });

  describe("bootstrap", () => {
    it("seeds missing plans and never overwrites an edited price", async () => {
      const bootstrap = new M2mLicensePlansBootstrapService(plans);
      await bootstrap.onApplicationBootstrap();
      await query(
        `update m2m_license_plans set per_device_year1_ngn = 99999, per_device_renewal_ngn = 88888, is_active = false
         where code = 'm2m_standard'`,
      );
      await bootstrap.onApplicationBootstrap();
      await Promise.all([bootstrap.onApplicationBootstrap(), bootstrap.onApplicationBootstrap()]);

      const standard = await plans.findByCode("m2m_standard");
      expect(standard).toMatchObject({ perDeviceYear1Ngn: 99999, perDeviceRenewalNgn: 88888, isActive: false });
      const rows = await query(`select count(*)::int as n from m2m_license_plans where code in ('m2m_standard','m2m_advance')`);
      expect(rows[0].n).toBe(2);
    });

    it("seeds from empty when the plan row is missing", async () => {
      const saved = (await query(`select * from m2m_license_plans where code = 'm2m_advance'`))[0];
      await query(`delete from m2m_license_plans where code = 'm2m_advance'`);
      await new M2mLicensePlansBootstrapService(plans).onApplicationBootstrap();
      const seeded = await plans.findByCode("m2m_advance");
      expect(seeded).toMatchObject({ perDeviceYear1Ngn: 124000, perDeviceRenewalNgn: 80000, validityDays: 365, isActive: true });
      await query(`update m2m_license_plans set per_device_year1_ngn = ?, per_device_renewal_ngn = ? where code = 'm2m_advance'`, [
        saved.per_device_year1_ngn,
        saved.per_device_renewal_ngn,
      ]);
    });
  });

  describe("installation price", () => {
    const getPrice = () => new GetInstallationPriceUseCase(settings, history);
    const setPrice = () => new UpdateInstallationPriceUseCase(settings, history, ids, audit as any);

    it("reads seeded values, writes with history, and no-ops when unchanged", async () => {
      await settings.savePriced(
        [
          { key: BILLING_SETTING_KEYS.installationFeeEnterprise, value: 15000 },
          { key: BILLING_SETTING_KEYS.installationFeeOwnerOperator, value: 15000 },
        ],
        "u-1",
        [],
      );
      const before = (await history.list({ itemType: "installation_fee", itemRef: "installation_fee", page: 1, limit: 1 })).total;
      const initial = (await getPrice().execute()).data;
      expect(initial).toMatchObject({ enterpriseNgn: 15000, ownerOperatorNgn: 15000 });

      await setPrice().execute(actor, { enterpriseNgn: 18000, ownerOperatorNgn: 12000, reason: "repricing" });
      const updated = (await getPrice().execute()).data;
      expect(updated).toMatchObject({ enterpriseNgn: 18000, ownerOperatorNgn: 12000 });
      expect(updated.lastChangedAt).toEqual(expect.any(String));
      const rows = await query(`select field, old_price_ngn, new_price_ngn from billing_price_changes where item_type = 'installation_fee' order by created_at desc limit 2`);
      expect(rows.map((r) => r.field).sort()).toEqual(["enterprise", "owner_operator"]);

      await setPrice().execute(actor, { enterpriseNgn: 18000, ownerOperatorNgn: 12000 });
      const after = (await history.list({ itemType: "installation_fee", itemRef: "installation_fee", page: 1, limit: 1 })).total;
      expect(after - before).toBe(2);
    });

    it("failing history insert rolls the setting back", async () => {
      const key = BILLING_SETTING_KEYS.installationFeeEnterprise;
      const bad = change("installation_fee", { itemType: "installation_fee", field: "enterprise", reason: "x".repeat(600) });
      await expect(settings.savePriced([{ key, value: 55555 }], "u-1", [bad])).rejects.toThrow();
      expect((await settings.getAll())[key].value).toBe(18000);
    });

    it("two concurrent installation edits chain old -> mid -> new", async () => {
      const key = BILLING_SETTING_KEYS.installationFeeEnterprise;
      await settings.savePriced([{ key, value: 10000 }], "u-1", []);
      await query(`delete from billing_price_changes where item_type = 'installation_fee'`);
      const owner = (await settings.getAll())[BILLING_SETTING_KEYS.installationFeeOwnerOperator].value;

      await Promise.all(
        [11000, 12000].map((price) =>
          setPrice().execute(actor, { enterpriseNgn: price, ownerOperatorNgn: owner, reason: `to ${price}` }),
        ),
      );

      const rows = await query(
        `select old_price_ngn, new_price_ngn from billing_price_changes
         where item_type = 'installation_fee' and field = 'enterprise'`,
      );
      expect(rows).toHaveLength(2);
      const first = rows.find((r) => Number(r.old_price_ngn) === 10000)!;
      const second = rows.find((r) => r !== first)!;
      expect(first).toBeDefined();
      expect(Number(second.old_price_ngn)).toBe(Number(first.new_price_ngn));
      expect((await settings.getAll())[key].value).toBe(Number(second.new_price_ngn));
      await settings.savePriced([{ key, value: 18000 }], "u-1", []);
    });

    it("order uses stored fee per applicant type and live plan price", async () => {
      const plan = newPlan({ perDeviceYear1Ngn: 10000, perDeviceRenewalNgn: 7000 });
      await plans.save(plan);
      const devices = [{ quantity: 2 }, { quantity: 1 }];
      const build = (applicantType: string) =>
        new GetApplicationOrderUseCase(
          { findDeviceRequestsByApplicationId: async () => devices } as any,
          plans,
          { findLatestForApplication: async () => null } as any,
          {
            resolve: async () => ({
              id: "app-1",
              applicantType,
              m2mPlanCode: plan.code,
              stage: "payment",
              billingEmail: null,
              billingEmailVerifiedAt: null,
            }),
          } as any,
          settings,
        );

      const enterprise = (await build("enterprise").execute("app-1", "tok")).data.order;
      expect(enterprise).toMatchObject({
        deviceCount: 3,
        perDeviceNgn: 10000,
        devicesNgn: 30000,
        installationNgn: 54000,
        totalNgn: 84000,
        renewalPerDeviceNgn: 7000,
      });
      const operator = (await build("owner_operator").execute("app-1", "tok")).data.order;
      expect(operator).toMatchObject({ installationNgn: 36000, totalNgn: 66000 });

      await setPrice().execute(actor, { enterpriseNgn: 20000, ownerOperatorNgn: 12000, reason: "again" });
      const repriced = (await build("enterprise").execute("app-1", "tok")).data.order;
      expect(repriced).toMatchObject({ installationNgn: 60000, totalNgn: 90000 });
    });
  });
});
