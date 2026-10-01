import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roleToId } from "@shared/rbac";
import { dbEnabled, getConfig, getOrm } from "./helper";
import { MikroEnforcementQueriesRepository } from "../../apps/auth/src/enforcement-queries.repository";
import { MikroEnforcementSettingsRepository } from "../../apps/auth/src/mikro-enforcement-settings.repository";
import { EnforcementPlanService } from "../../apps/auth/src/enforcement-plan.service";
import { computeTiming } from "../../apps/auth/src/contexts/onboarding/domain/enforcement-stage";

type Row = Record<string, unknown>;

const TODAY = "2026-10-05";
const NOW = new Date("2026-10-05T10:00:00+01:00");
const LAGOS_EARLIER = "2026-10-03T10:00:00+01:00";

describe.skipIf(!dbEnabled)("non-payment enforcement on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const queries = new MikroEnforcementQueriesRepository(config);
  const settingsRepo = new MikroEnforcementSettingsRepository(config);
  const planner = new EnforcementPlanService(queries, settingsRepo);
  const tag = `en${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let seq = 0;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const id = (p: string) => `${tag}-${p}`;
  const mine = <T extends { tenantId: string }>(rows: T[]) => rows.filter((r) => r.tenantId.startsWith(tag));

  const user = (tenantId: string, email = `${tenantId}@acme.test`, role = "FLEET_ADMIN") =>
    query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status)
       values (?, ?, 'x', ?, ?, 'enabled')`,
      [`${tenantId}-u${++seq}`, `${randomUUID().slice(0, 6)}${email}`, roleToId(role), tenantId],
    );

  const invoice = (o: {
    tenantId?: string | null;
    applicationId?: string | null;
    due: string;
    status?: string;
    total?: number;
    paid?: number;
  }) =>
    query(
      `insert into billing_invoices (id, number, prefix, year, sequence, tenant_id, application_id, customer_name,
         customer_type, billing_email, status, issue_date, due_date, subtotal_kobo, total_kobo, amount_paid_kobo)
       values (?, ?, 'T', 2026, ?, ?, ?, ?, 'enterprise', 'b@x.test', ?, '2026-09-01', ?, ?, ?, ?)`,
      [
        `${tag}-inv${++seq}`, `${tag}-N${seq}`, 900000 + seq, o.tenantId ?? null, o.applicationId ?? null,
        `${tag} customer`, o.status ?? "issued", o.due, o.total ?? 100_000, o.total ?? 100_000, o.paid ?? 0,
      ],
    );

  const arrears = (tenantId: string, due: string, amount: number, resolved = false) =>
    query(
      `insert into billing_arrears (tenant_id, source, reference, due_date, amount_kobo, resolved_at)
       values (?, 'sim_monthly', ?, ?, ?, ${resolved ? "now()" : "null"})`,
      [tenantId, `${tag}-ref${++seq}`, due, amount],
    );

  const suspension = (tenantId: string, cause: string, unpaidSince: string | null = null) =>
    query(
      `insert into tenant_suspensions (tenant_id, suspended_by, reason, cause, unpaid_since, cascade_status)
       values (?, 'sys', 'because', ?, ?, 'partial')`,
      [tenantId, cause, unpaidSince],
    );

  const notice = (tenantId: string, kind: string, unpaidSince: string, createdAt: string, status = "sent") =>
    query(
      `insert into enforcement_notices (tenant_id, kind, dedup_key, unpaid_since, status, created_at, sent_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, kind, `${tag}|${tenantId}|${kind}|${unpaidSince}|${++seq}`, unpaidSince, status, createdAt, createdAt],
    );

  const t = {
    past: id("past"),
    multi: id("multi"),
    arrearsOnly: id("arrears"),
    viaApp: id("viaapp"),
    paid: id("paid"),
    noUsers: id("nousers"),
    current: id("current"),
    manual: id("manual"),
    stuck: id("stuck"),
    waived: id("waived"),
    noContact: id("nocontact"),
    draft: id("draft"),
  };

  beforeAll(async () => {
    orm = await getOrm();
    await settingsRepo.update({ graceDays: 3, autoSuspendEnabled: false, autoSuspendCapPerRun: 10, paused: false }, "test");

    for (const tenant of Object.values(t).filter((x) => x !== t.noUsers && x !== t.noContact)) await user(tenant);
    await query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status)
       values (?, ?, 'x', ?, ?, 'enabled')`,
      [`${t.noContact}-u`, "not-an-email", roleToId("FLEET_ADMIN"), t.noContact],
    );
    await user(t.noContact, "@staff.test", "DISPATCHER");
    await query(
      `insert into auth_organization_settings (tenant_id, branding, defaults)
       values (?, ?::json, '{}'::json)`,
      [t.past, JSON.stringify({ organizationName: `${tag} Acme Haulage` })],
    );

    await invoice({ tenantId: t.past, due: "2026-10-01", total: 125_000 });
    await invoice({ tenantId: t.multi, due: "2026-10-03", total: 80_000 });
    await invoice({ tenantId: t.multi, due: "2026-10-02", status: "partially_paid", total: 60_000, paid: 10_000 });
    await arrears(t.arrearsOnly, "2026-10-04", 7_500);
    await arrears(t.arrearsOnly, "2026-09-01", 9_999, true);

    const appId = id("app");
    await query(
      `insert into onboarding_applications (id, reference, token_hash, applicant_type, organization_name, business_email,
         organization_phone, contact_full_name, contact_role, street_address, city, state, tenant_id)
       values (?, ?, 'h', 'fleet_provider', ?, ?, '+2348000000000', 'J D', 'owner', 'Mazi', 'Abuja', 'FCT', ?)`,
      [appId, `APP-${randomUUID().slice(0, 24)}`, `${tag} app`, `${appId}@x.test`, t.viaApp],
    );
    await invoice({ tenantId: null, applicationId: appId, due: "2026-09-25", total: 40_000 });

    await invoice({ tenantId: t.paid, due: "2026-09-01", status: "paid", total: 5_000, paid: 5_000 });
    await invoice({ tenantId: t.paid, due: "2026-09-02", status: "issued", total: 5_000, paid: 5_000 });
    await invoice({ tenantId: t.draft, due: "2026-09-01", status: "draft" });
    await invoice({ tenantId: t.draft, due: "2026-09-01", status: "cancelled" });
    await invoice({ tenantId: t.noUsers, due: "2026-09-01" });
    await invoice({ tenantId: t.current, due: "2026-10-05", total: 20_000 });
    await invoice({ tenantId: t.manual, due: "2026-09-20", total: 30_000 });
    await invoice({ tenantId: t.waived, due: "2026-09-20", total: 30_000 });
    await invoice({ tenantId: t.noContact, due: "2026-09-20", total: 30_000 });

    await suspension(t.manual, "manual");
    await suspension(t.stuck, "non_payment", "2026-09-10");
    await notice(t.past, "final", "2026-10-01", LAGOS_EARLIER);
    await notice(t.waived, "final", "2026-09-20", LAGOS_EARLIER);
    await notice(t.noContact, "final", "2026-09-20", LAGOS_EARLIER);
    await notice(t.viaApp, "grace_daily", "2026-09-25", LAGOS_EARLIER, "failed");
    await query(`insert into enforcement_waivers (tenant_id, unpaid_since, created_by) values (?, '2026-09-20', 'staff')`, [t.waived]);
  });

  afterAll(async () => {
    const tenants = Object.values(t);
    const marks = tenants.map(() => "?").join(",");
    await query(`delete from enforcement_waivers where tenant_id in (${marks})`, tenants);
    await query(`delete from enforcement_notices where tenant_id in (${marks})`, tenants);
    await query(`delete from tenant_suspensions where tenant_id in (${marks})`, tenants);
    await query(`delete from billing_arrears where reference like ?`, [`${tag}%`]);
    await query(`delete from billing_invoices where customer_name like ?`, [`${tag}%`]);
    await query(`delete from onboarding_applications where organization_name like ?`, [`${tag}%`]);
    await query(`delete from auth_organization_settings where tenant_id in (${marks})`, tenants);
    await query(`delete from auth_users where tenant_id in (${marks})`, tenants);
    await settingsRepo.update({ graceDays: 3, autoSuspendEnabled: false, autoSuspendCapPerRun: 10, paused: false }, "test");
    await orm?.close();
  });

  describe("settings", () => {
    it("starts from the seeded safe defaults and stores partial updates with the actor", async () => {
      const updated = await settingsRepo.update({ graceDays: 5 }, "staff-1");
      expect(updated).toMatchObject({ graceDays: 5, autoSuspendEnabled: false, autoSuspendCapPerRun: 10, paused: false, updatedBy: "staff-1" });
      expect(typeof updated.updatedAt).toBe("string");
      expect(await settingsRepo.get()).toEqual(updated);
      await settingsRepo.update({ graceDays: 3 }, "test");
    });

    it("rejects values outside the allowed range at the database", async () => {
      await expect(settingsRepo.update({ graceDays: 31 }, "x")).rejects.toThrow();
      await expect(settingsRepo.update({ autoSuspendCapPerRun: 0 }, "x")).rejects.toThrow();
      expect((await settingsRepo.get()).graceDays).toBe(3);
    });
  });

  describe("stage query", () => {
    const find = async (tenantId: string) =>
      mine(await queries.candidates(3, TODAY)).find((r) => r.tenantId === tenantId);

    it("finds unpaid invoices with owed amount and stage", async () => {
      expect(await find(t.past)).toMatchObject({
        dueDate: "2026-10-01", graceEndsOn: "2026-10-04", stage: "past_grace", owedKobo: 125_000, items: 1,
        sources: ["invoice"], tenantName: `${tag} Acme Haulage`,
      });
    });

    it("uses the earliest due date and sums what is still owed across items", async () => {
      expect(await find(t.multi)).toMatchObject({
        dueDate: "2026-10-02", graceEndsOn: "2026-10-05", stage: "in_grace", owedKobo: 80_000 + 50_000, items: 2,
      });
    });

    it("counts unresolved SIM monthly arrears only", async () => {
      expect(await find(t.arrearsOnly)).toMatchObject({
        dueDate: "2026-10-04", owedKobo: 7_500, items: 1, sources: ["sim_monthly"], stage: "in_grace",
      });
    });

    it("attributes an invoice to the tenant of its application", async () => {
      expect(await find(t.viaApp)).toMatchObject({ dueDate: "2026-09-25", stage: "past_grace", owedKobo: 40_000 });
    });

    it("ignores paid, fully covered, draft, cancelled, no-user and system tenants", async () => {
      for (const tenant of [t.paid, t.draft, t.noUsers]) expect(await find(tenant)).toBeUndefined();
      expect(await find("system")).toBeUndefined();
    });

    it("treats the due day as current", async () => {
      expect(await find(t.current)).toMatchObject({ stage: "current", dueDate: "2026-10-05" });
    });

    it("agrees with the TypeScript stage maths on every row and on boundary days", async () => {
      for (const today of ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"]) {
        for (const grace of [0, 3]) {
          for (const row of mine(await queries.candidates(grace, today))) {
            const timing = computeTiming(row.dueDate, grace, today);
            expect(row.stage, `${row.tenantId} ${today} g${grace}`).toBe(timing.stage);
            expect(row.graceEndsOn).toBe(timing.graceEndsOn);
          }
        }
      }
    });

    it("reports suspension state, contact, waiver and prior-notice proof", async () => {
      expect(await find(t.manual)).toMatchObject({ suspensionCause: "manual", cascadeStatus: "partial", suspendedAt: expect.any(String) });
      expect(await find(t.past)).toMatchObject({ hasContact: true, waived: false, finalNoticeSentEarlier: true, lastNoticeKind: "final" });
      expect(await find(t.waived)).toMatchObject({ waived: true });
      expect(await find(t.noContact)).toMatchObject({ hasContact: false });
      const failed = await find(t.viaApp);
      expect(failed).toMatchObject({ finalNoticeSentEarlier: false, lastNoticeKind: null });
    });

    it("does not count a final notice created on the same Lagos day as earlier", async () => {
      const tenant = id("sameday");
      await user(tenant);
      await invoice({ tenantId: tenant, due: "2026-09-20" });
      await notice(tenant, "final", "2026-09-20", "2026-10-05T07:00:00+01:00");
      const row = (await queries.candidates(3, TODAY)).find((r) => r.tenantId === tenant);
      expect(row?.finalNoticeSentEarlier).toBe(false);
      await query(`delete from enforcement_notices where tenant_id = ?`, [tenant]);
      await query(`delete from billing_invoices where tenant_id = ?`, [tenant]);
      await query(`delete from auth_users where tenant_id = ?`, [tenant]);
    });
  });

  describe("list", () => {
    const page = (over: object = {}) =>
      queries.page({ graceDays: 3, today: TODAY, stage: "all", q: tag, page: 1, pageSize: 25, ...over });

    it("lists unpaid tenants plus stuck non-payment suspensions, oldest due first", async () => {
      const { rows, total } = await page();
      expect(rows.map((r) => r.tenantId)).toContain(t.stuck);
      expect(rows.find((r) => r.tenantId === t.stuck)).toMatchObject({ suspensionCause: "non_payment", items: 0, owedKobo: 0, stage: "current", dueDate: "2026-09-10" });
      const dates = rows.map((r) => `${r.dueDate}|${r.tenantId}`);
      expect(dates).toEqual([...dates].sort());
      expect(total).toBe(rows.length);
    });

    it("filters by stage, suspension and search", async () => {
      expect((await page({ stage: "in_grace" })).rows.map((r) => r.tenantId).sort()).toEqual([t.arrearsOnly, t.multi].sort());
      const suspended = (await page({ suspended: true })).rows.map((r) => r.tenantId).sort();
      expect(suspended).toEqual([t.manual, t.stuck].sort());
      expect((await page({ suspended: false })).rows.map((r) => r.tenantId)).not.toContain(t.manual);
      expect((await page({ q: "ACME HAULAGE" })).rows.map((r) => r.tenantId)).toEqual([t.past]);
      expect((await page({ q: `${tag}%` })).total).toBe(0);
    });

    it("pages with a stable total", async () => {
      const first = await page({ pageSize: 2 });
      const second = await page({ pageSize: 2, page: 2 });
      expect(first.rows).toHaveLength(2);
      expect(second.rows.map((r) => r.tenantId)).not.toEqual(first.rows.map((r) => r.tenantId));
      expect(second.total).toBe(first.total);
    });

    it("summarises the whole set", async () => {
      const summary = await queries.summary(3, TODAY);
      expect(summary.inGrace).toBeGreaterThanOrEqual(2);
      expect(summary.pastGrace).toBeGreaterThanOrEqual(4);
      expect(summary.suspendedManual).toBeGreaterThanOrEqual(1);
      expect(summary.suspendedNonPayment).toBeGreaterThanOrEqual(1);
      expect(summary.owedKobo).toBeGreaterThan(0);
    });
  });

  describe("plan", () => {
    it("selects only fully eligible tenants and explains the rest", async () => {
      const plan = await planner.plan(NOW);
      expect(plan.today).toBe(TODAY);
      expect(plan.settings.autoSuspendEnabled).toBe(false);
      expect(mine(plan.wouldSuspend).map((r) => r.tenantId)).toEqual([t.past]);
      expect(plan.deferred.filter((d) => d.tenantId.startsWith(tag)).sort((a, b) => a.tenantId.localeCompare(b.tenantId))).toEqual(
        [
          { tenantId: t.noContact, why: "no_contact" },
          { tenantId: t.viaApp, why: "no_notice_yet" },
          { tenantId: t.waived, why: "waived" },
        ].sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
      );
      expect(mine(plan.rows).map((r) => r.tenantId)).not.toContain(t.stuck);
    });

    it("applies the per-run cap using the stored setting", async () => {
      const other = id("second");
      await user(other);
      await invoice({ tenantId: other, due: "2026-09-29" });
      await notice(other, "final", "2026-09-29", LAGOS_EARLIER);
      await settingsRepo.update({ autoSuspendCapPerRun: 1 }, "test");
      const plan = await planner.plan(NOW);
      expect(plan.wouldSuspend).toHaveLength(1);
      expect(plan.deferred.some((d) => d.why === "capped")).toBe(true);
      await settingsRepo.update({ autoSuspendCapPerRun: 10 }, "test");
      await query(`delete from enforcement_notices where tenant_id = ?`, [other]);
      await query(`delete from billing_invoices where tenant_id = ?`, [other]);
      await query(`delete from auth_users where tenant_id = ?`, [other]);
    });

    it("returns a customer to current once the debt is gone", async () => {
      await query(`update billing_invoices set status = 'paid', amount_paid_kobo = total_kobo where tenant_id = ?`, [t.past]);
      const plan = await planner.plan(NOW);
      expect(mine(plan.rows).map((r) => r.tenantId)).not.toContain(t.past);
      expect(mine(plan.wouldSuspend)).toEqual([]);
    });
  });
});
