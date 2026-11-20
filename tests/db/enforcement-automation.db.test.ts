import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roleToId } from "@shared/rbac";
import { runIfLockFree } from "@shared/db";
import { dbEnabled, getConfig, getOrm } from "./helper";
import { MikroArrearsRepository } from "../../apps/auth/src/arrears.repository";
import { MikroEnforcementNoticeRepository } from "../../apps/auth/src/enforcement-notice.repository";
import { MikroEnforcementRunRepository } from "../../apps/auth/src/enforcement-run.repository";
import { ENFORCEMENT_SWEEP_LOCK_ID, EnforcementSweepService } from "../../apps/auth/src/enforcement-sweep.service";

type Row = Record<string, unknown>;

describe.skipIf(!dbEnabled)("enforcement automation on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never), persistence: { backend: "mikro-orm" } } as any;
  const notices = new MikroEnforcementNoticeRepository(config);
  const arrears = new MikroArrearsRepository(config);
  const runs = new MikroEnforcementRunRepository(config);
  const tag = `ea${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const dates: string[] = [];
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let seq = 0;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const noticeRow = async (key: string) => (await query(`select * from enforcement_notices where dedup_key = ?`, [key]))[0];
  const input = (key: string, tenantId = `${tag}-t`) => ({
    tenantId, kind: "final" as const, dedupKey: `${tag}|${key}`, unpaidSince: "2026-10-01", recipients: ["a@x.test"],
  });
  const runDate = () => {
    const date = `2${String(900 + ++seq).padStart(3, "0")}-01-01`;
    dates.push(date);
    return date;
  };

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    await query(`delete from enforcement_notices where dedup_key like ?`, [`${tag}|%`]);
    await query(`delete from billing_arrears where tenant_id like ?`, [`${tag}%`]);
    await query(`delete from billing_invoices where id like ?`, [`${tag}%`]);
    await query(`delete from auth_users where tenant_id like ?`, [`${tag}%`]);
    await query(`delete from tenant_business_info where tenant_id like ?`, [`${tag}%`]);
    for (const date of dates) await query(`delete from enforcement_runs where run_date = ?`, [date]);
  });

  it("migration adds the arrears quantity column", async () => {
    const rows = await query(
      `select 1 from information_schema.columns where table_name = 'billing_arrears' and column_name = 'quantity'`,
    );
    expect(rows).toHaveLength(1);
  });

  describe("notices", () => {
    it("lets exactly one of two racing callers claim a key", async () => {
      const claims = await Promise.all([notices.claim(input("race")), notices.claim(input("race"))]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await notices.claim(input("race"))).toBeNull();
    });

    it("never reclaims a sent notice", async () => {
      const claim = await notices.claim(input("sent"));
      await notices.markSent(claim!.id);
      expect(await notices.claim(input("sent"))).toBeNull();
      expect((await noticeRow(`${tag}|sent`)).status).toBe("sent");
    });

    it("retries a failed notice up to three tries and stamps the retry as new", async () => {
      const first = await notices.claim(input("fail"));
      await notices.markFailed(first!.id, "smtp down");
      await query(`update enforcement_notices set created_at = now() - interval '3 days' where id = ?`, [first!.id]);

      const second = await notices.claim(input("fail"));
      expect(second).toEqual({ id: first!.id, attempts: 2 });
      const row = await noticeRow(`${tag}|fail`);
      expect(row.status).toBe("pending");
      expect(Date.now() - new Date(row.created_at as string).getTime()).toBeLessThan(60_000);

      await notices.markFailed(second!.id, "smtp down");
      const third = await notices.claim(input("fail"));
      expect(third?.attempts).toBe(3);
      await notices.markFailed(third!.id, "smtp down");
      expect(await notices.claim(input("fail"))).toBeNull();
    });

    it("leaves a fresh in-flight notice alone but retakes one stuck for an hour", async () => {
      const claim = await notices.claim(input("stuck"));
      expect(await notices.claim(input("stuck"))).toBeNull();
      await query(`update enforcement_notices set created_at = now() - interval '2 hours' where id = ?`, [claim!.id]);
      expect(await notices.claim(input("stuck"))).toEqual({ id: claim!.id, attempts: 2 });
    });

    it("finds tenant admins (enabled or not) and the business contact, skipping other roles and bad emails", async () => {
      const tenantId = `${tag}-c`;
      const addUser = (email: string, role: string, status = "enabled") =>
        query(
          `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status) values (?, ?, 'x', ?, ?, ?)`,
          [`${tenantId}-${++seq}`, email, roleToId(role), tenantId, status],
        );
      await addUser(`${tag}-admin@x.test`, "OWNER_OPERATOR");
      await addUser(`${tag}-off@x.test`, "ENTERPRISE_ADMIN", "disabled");
      await addUser(`${tag}-driver@x.test`, "DISPATCHER");
      await addUser("not-an-email", "OWNER_OPERATOR");
      await query(
        `insert into tenant_business_info (tenant_id, company_name, billing_email, email) values (?, ?, ?, ?)`,
        [tenantId, `${tag} Haulage`, `${tag}-Billing@X.test`, `${tag}-admin@x.test`],
      );

      const contacts = await notices.contactsFor(tenantId);

      expect(contacts.customerName).toBe(`${tag} Haulage`);
      expect(contacts.emails.sort()).toEqual(
        [`${tag}-admin@x.test`, `${tag}-off@x.test`, `${tag}-billing@x.test`].sort(),
      );
    });

    it("falls back to the tenant id when nothing names the customer", async () => {
      expect(await notices.contactsFor(`${tag}-nobody`)).toEqual({ customerName: `${tag}-nobody`, emails: [] });
    });
  });

  describe("arrears", () => {
    it("records a reference once and lists open ones oldest first", async () => {
      const tenantId = `${tag}-a`;
      const arrear = (ref: string, dueDate: string) => ({ tenantId, reference: `${tag}-${ref}`, dueDate, amountKobo: 5_000, quantity: 4 });
      expect(await arrears.record(arrear("r2", "2026-09-01"))).toBe(true);
      expect(await arrears.record(arrear("r2", "2026-09-01"))).toBe(false);
      expect(await arrears.record(arrear("r1", "2026-08-01"))).toBe(true);

      const open = await arrears.listOpen(tenantId);
      expect(open.map((a) => a.dueDate)).toEqual(["2026-08-01", "2026-09-01"]);
      expect(open[0]).toMatchObject({ amountKobo: 5_000, quantity: 4 });
      expect(await arrears.tenantsWithOpen()).toContain(tenantId);

      await arrears.resolve(open[0].id, "paid");
      expect((await arrears.listOpen(tenantId)).map((a) => a.dueDate)).toEqual(["2026-09-01"]);
    });

    it("lists unpaid invoices and open arrears together, ignoring paid and cancelled ones", async () => {
      const tenantId = `${tag}-i`;
      const invoice = (status: string, due: string, total: number, paid: number) =>
        query(
          `insert into billing_invoices (id, number, prefix, year, sequence, tenant_id, customer_name, customer_type,
             billing_email, status, issue_date, due_date, subtotal_kobo, total_kobo, amount_paid_kobo)
           values (?, ?, 'T', 2026, ?, ?, 'c', 'enterprise', 'b@x.test', ?, '2026-09-01', ?, ?, ?, ?)`,
          [`${tag}-inv${++seq}`, `${tag}-N${seq}`, 800000 + seq, tenantId, status, due, total, total, paid],
        );
      await invoice("issued", "2026-10-02", 100_000, 0);
      await invoice("partially_paid", "2026-10-03", 100_000, 40_000);
      await invoice("paid", "2026-09-01", 100_000, 100_000);
      await invoice("cancelled", "2026-09-01", 100_000, 0);
      await arrears.record({ tenantId, reference: `${tag}-ai`, dueDate: "2026-10-01", amountKobo: 3_000, quantity: 1 });

      const items = await arrears.openItems(tenantId);

      expect(items.map((i) => [i.source, i.dueDate, i.owedKobo])).toEqual([
        ["sim_monthly", "2026-10-01", 3_000],
        ["invoice", "2026-10-02", 100_000],
        ["invoice", "2026-10-03", 60_000],
      ]);
      expect(await arrears.openItems(`${tag}-none`)).toEqual([]);
    });
  });

  describe("daily runs", () => {
    it("lets one caller claim a day, and finish it", async () => {
      const date = runDate();
      const claims = await Promise.all([runs.claim(date), runs.claim(date)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const id = claims.find(Boolean)!;
      await runs.finish(id, { notified: 3, suspended: 2, restored: 1, capped: 4 });
      expect(await runs.claim(date)).toBeNull();
      expect((await query(`select * from enforcement_runs where run_date = ?`, [date]))[0]).toMatchObject({
        notified: 3, suspended: 2, restored: 1, capped: 4,
      });
    });

    it("lets a skipped day be claimed later, but not a finished one", async () => {
      const date = runDate();
      await runs.recordSkip(date, "off");
      await runs.recordSkip(date, "paused");
      expect((await query(`select skipped_reason from enforcement_runs where run_date = ?`, [date]))[0].skipped_reason).toBe("off");
      const id = await runs.claim(date);
      expect(id).not.toBeNull();
      expect((await query(`select skipped_reason from enforcement_runs where run_date = ?`, [date]))[0].skipped_reason).toBeNull();
    });

    it("retakes a day whose run died more than an hour ago", async () => {
      const date = runDate();
      const id = await runs.claim(date);
      expect(await runs.claim(date)).toBeNull();
      await runs.fail(id!, "crashed");
      await query(`update enforcement_runs set started_at = now() - interval '2 hours' where id = ?`, [id]);
      expect(await runs.claim(date)).toBe(id);
    });
  });

  describe("sweep lock", () => {
    function sweepThatCounts() {
      const calls = { plan: 0 };
      const settings = { get: async () => ({ autoSuspendEnabled: false, paused: false }) };
      const planner = { plan: async () => { calls.plan += 1; } };
      const none = { findAll: async () => [], tenantsWithOpen: async () => [] };
      const sweep = new EnforcementSweepService(
        config, settings as never, planner as never, { listIncomplete: async () => [] } as never,
        none as never, {} as never, {} as never, { recordSkip: async () => {} } as never, none as never, {} as never,
      );
      return { sweep, calls };
    }

    it("skips the whole tick while another process holds the lock", async () => {
      const { sweep } = sweepThatCounts();
      const held = await runIfLockFree(orm as never, ENFORCEMENT_SWEEP_LOCK_ID, () => sweep.run(new Date("2026-10-05T10:00:00+01:00")));

      expect(held.acquired && held.value.daily).toEqual({ ran: false, skipped: "already_ran" });
    });

    it("runs when the lock is free", async () => {
      const { sweep } = sweepThatCounts();
      const result = await sweep.run(new Date("2026-10-05T10:00:00+01:00"));
      expect(result.daily).toEqual({ ran: false, skipped: "off" });
    });
  });
});
