import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roleToId } from "@shared/rbac";
import { dbEnabled, getConfig, getOrm } from "./helper";
import { MikroEnforcementQueriesRepository } from "../../apps/auth/src/enforcement-queries.repository";
import { MikroEnforcementSettingsRepository } from "../../apps/auth/src/mikro-enforcement-settings.repository";
import { EnforcementPlanService } from "../../apps/auth/src/enforcement-plan.service";
import { MikroTenantAssetStore } from "../../apps/auth/src/tenant-asset-store";

type Row = Record<string, unknown>;
const NOW = new Date("2026-10-05T10:00:00+01:00");

describe.skipIf(!dbEnabled)("review: wrongful suspension paths", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const settings = new MikroEnforcementSettingsRepository(config);
  const planner = new EnforcementPlanService(new MikroEnforcementQueriesRepository(config), settings);
  const store = new MikroTenantAssetStore(config);
  const tag = `rv${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let seq = 0;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const tenantWithDebt = async (name: string, due: string, finalAt: string | null, graceAtSend: number | null = 3) => {
    const tenantId = `${tag}-${name}`;
    await query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status)
       values (?, ?, 'x', ?, ?, 'enabled')`,
      [`${tenantId}-u`, `${name}${tag}@acme.test`, roleToId("OWNER_OPERATOR"), tenantId],
    );
    await query(
      `insert into billing_invoices (id, number, prefix, year, sequence, tenant_id, customer_name, customer_type,
         billing_email, status, issue_date, due_date, subtotal_kobo, total_kobo, amount_paid_kobo)
       values (?, ?, 'T', 2026, ?, ?, 'c', 'enterprise', 'b@x.test', 'issued', '2026-09-01', ?, 100000, 100000, 0)`,
      [`${tenantId}-inv`, `${tag}-N${++seq}`, 800000 + seq + Math.floor(Math.random() * 1e5), tenantId, due],
    );
    if (finalAt) {
      await query(
        `insert into enforcement_notices (tenant_id, kind, dedup_key, unpaid_since, status, created_at, sent_at, grace_days_at_send)
         values (?, 'final', ?, ?, 'sent', ?, ?, ?)`,
        [tenantId, `${tenantId}|final|${due}`, due, finalAt, finalAt, graceAtSend],
      );
    }
    return tenantId;
  };

  beforeAll(async () => {
    orm = await getOrm();
    await settings.update({ graceDays: 3, autoSuspendEnabled: false, autoSuspendCapPerRun: 10, paused: false }, "test");
  });

  afterAll(async () => {
    await settings.update({ graceDays: 3 }, "test");
    for (const table of ["auth_users", "billing_invoices", "enforcement_notices", "iot_sims", "tenant_terminations", "tenant_suspensions"]) {
      await query(`delete from ${table} where tenant_id like ?`, [`${tag}-%`]);
    }
  });

  it("a terminated customer is never a suspension candidate", async () => {
    const tenantId = await tenantWithDebt("term", "2026-09-20", "2026-10-03T10:00:00+01:00");
    await query(`insert into tenant_terminations (tenant_id, reason, terminated_by) values (?, 'ended', 'staff')`, [tenantId]);
    const plan = await planner.plan(NOW);
    expect(plan.wouldSuspend.map((r) => r.tenantId)).not.toContain(tenantId);
    expect(plan.wouldNotify.map((n) => n.tenantId)).not.toContain(tenantId);
  });

  it("releasing a payment hold does not revive SIMs and users staff terminated afterwards", async () => {
    const tenantId = `${tag}-revive`;
    await query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status)
       values (?, ?, 'x', 1, ?, 'enabled')`,
      [`${tenantId}-u`, `r${tag}@acme.test`, tenantId],
    );
    const simId = randomUUID();
    await query(
      `insert into iot_sims (id, iccid, carrier, status, tenant_id) values (?, ?, 'MTN', 'assigned', ?)`,
      [simId, simId.replace(/-/g, "").slice(0, 30), tenantId],
    );
    await store.holdUsers(tenantId, "non_payment");
    await store.holdSims(tenantId, "non_payment", "Unpaid since x, grace of 3 days ended");
    await query(`update iot_sims set status = 'deactivated' where id = ?`, [simId]);

    await store.releaseSims(tenantId, ["non_payment"]);
    const [sim] = await query(`select status from iot_sims where id = ?`, [simId]);
    expect(sim.status).toBe("deactivated");
  });

  it("lowering grace days cannot suspend before the date the customer was emailed", async () => {
    const tenantId = await tenantWithDebt("shrink", "2026-10-03", "2026-10-04T10:00:00+01:00");
    expect((await planner.plan(NOW)).wouldSuspend.map((r) => r.tenantId)).not.toContain(tenantId);
    await settings.update({ graceDays: 0 }, "test");
    try {
      expect((await planner.plan(NOW)).wouldSuspend.map((r) => r.tenantId)).not.toContain(tenantId);
    } finally {
      await settings.update({ graceDays: 3 }, "test");
    }
  });

  const suspendable = async (tenantId: string, at = NOW) =>
    (await planner.plan(at)).wouldSuspend.map((r) => r.tenantId).includes(tenantId);

  const withGrace = async (days: number, run: () => Promise<void>) => {
    await settings.update({ graceDays: days }, "test");
    try {
      await run();
    } finally {
      await settings.update({ graceDays: 3 }, "test");
    }
  };

  it("a late final notice sent after grace ended is suspendable the next day", async () => {
    const tenantId = await tenantWithDebt("late", "2026-09-20", "2026-10-04T10:00:00+01:00");
    expect(await suspendable(tenantId, new Date("2026-10-04T12:00:00+01:00"))).toBe(false);
    expect(await suspendable(tenantId)).toBe(true);
  });

  it("raising grace days still delays suspension", async () => {
    const tenantId = await tenantWithDebt("raise", "2026-09-30", "2026-10-02T10:00:00+01:00");
    expect(await suspendable(tenantId)).toBe(true);
    await withGrace(10, async () => expect(await suspendable(tenantId)).toBe(false));
  });

  it("a legacy notice without recorded grace falls back to current grace", async () => {
    const tenantId = await tenantWithDebt("legacy", "2026-10-03", "2026-10-04T10:00:00+01:00", null);
    expect(await suspendable(tenantId)).toBe(false);
    await withGrace(0, async () => expect(await suspendable(tenantId)).toBe(true));
  });
});
