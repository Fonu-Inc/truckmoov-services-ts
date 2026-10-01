import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { MAX_SUSPEND_ATTEMPTS } from "../../../apps/auth/src/tenant-suspension.service";
import { buildEnforcement } from "./enforcement-harness";

const REASON = "Unpaid since 2026-10-01, grace of 3 days ended";

async function walk(h: Awaited<ReturnType<typeof buildEnforcement>>, dates: string[]) {
  for (const date of dates) await h.runDay(date);
}

describe("sweep switch and kill switch", () => {
  it("does nothing automatic while the switch is off, but the preview still works", async () => {
    const h = await buildEnforcement();
    await h.settings.update({ autoSuspendEnabled: false }, "t");
    await h.addTenant("a", { dueDate: "2026-09-01" });

    const result = await h.runDay("2026-10-05");

    expect(result.daily).toEqual({ ran: false, skipped: "off" });
    expect(h.mail.sent).toEqual([]);
    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(h.runs.runs.get("2026-10-05")?.skippedReason).toBe("off");
    const plan = await h.planner.plan(h.clock.now);
    expect(plan.wouldNotify.map((n) => n.tenantId)).toEqual(["a"]);
  });

  it("starts the same day once the switch is turned on", async () => {
    const h = await buildEnforcement();
    await h.settings.update({ autoSuspendEnabled: false }, "t");
    await h.addTenant("a", { dueDate: "2026-10-05" });
    await h.runDay("2026-10-05");
    await h.settings.update({ autoSuspendEnabled: true }, "t");

    const result = await h.runDay("2026-10-05", 10);

    expect(result.daily).toMatchObject({ ran: true, notified: 1 });
  });

  it("sends and suspends nothing while paused", async () => {
    const h = await buildEnforcement();
    await h.settings.update({ paused: true }, "t");
    await h.addTenant("a", { dueDate: "2026-09-01" });

    const result = await h.runDay("2026-10-05");

    expect(result.daily).toEqual({ ran: false, skipped: "paused" });
    expect(h.mail.sent).toEqual([]);
    expect(await h.suspensions.findOne("a")).toBeNull();
  });

  it("still restores a paying customer while paused", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    await walk(h, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(await h.userStatus("a-u0")).toBe("disabled");

    await h.settings.update({ paused: true }, "t");
    h.pay("a");
    const result = await h.runDay("2026-10-06");

    expect(result.restored).toBe(1);
    expect(await h.userStatus("a-u0")).toBe("enabled");
  });

  it("stops mid-run when the kill switch is pressed", async () => {
    const h = await buildEnforcement();
    for (const [i, id] of ["a", "b", "c"].entries()) await h.addTenant(id, { dueDate: `2026-09-0${i + 1}` });
    await h.runDay("2026-10-01");
    const real = h.suspension.suspend.bind(h.suspension);
    vi.spyOn(h.suspension, "suspend").mockImplementation(async (id, options) => {
      await h.settings.update({ paused: true }, "t");
      return real(id, options);
    });

    const result = await h.runDay("2026-10-02");

    expect(result.daily).toMatchObject({ ran: true, suspended: 1 });
    expect(await h.suspensions.findOne("a")).not.toBeNull();
    expect(await h.suspensions.findOne("b")).toBeNull();
    expect(await h.suspensions.findOne("c")).toBeNull();
  });

  it("waits for 08:00 in Lagos", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-05" });

    expect((await h.runDay("2026-10-05", 7)).daily).toEqual({ ran: false, skipped: "too_early" });
    expect((await h.runDay("2026-10-05", 8)).daily).toMatchObject({ ran: true });
  });
});

describe("grace boundaries", () => {
  it("suspends on the first day after grace and not on the last grace day", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });

    await walk(h, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(h.kinds()).toContain("due_today");
    expect(h.kinds()).toContain("final");

    await h.runDay("2026-10-05");
    const row = await h.suspensions.findOne("a");
    expect(row).toMatchObject({ cause: "non_payment", reason: REASON, unpaidSince: "2026-10-01", graceDays: 3, suspendedBy: "system" });
    expect(await h.userStatus("a-u0")).toBe("disabled");
    expect(h.kinds().at(-1)).toBe("suspended");
  });

  it("uses the grace days staff configured", async () => {
    const h = await buildEnforcement();
    await h.settings.update({ graceDays: 5 }, "t");
    await h.addTenant("a", { dueDate: "2026-10-01" });

    await walk(h, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(await h.suspensions.findOne("a")).toBeNull();

    await h.runDay("2026-10-07");
    expect((await h.suspensions.findOne("a"))?.reason).toBe("Unpaid since 2026-10-01, grace of 5 days ended");
  });

  it("never suspends a customer on the day the last reminder is first sent", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01" });

    const first = await h.runDay("2026-10-05");
    expect(first.daily).toMatchObject({ ran: true, notified: 1, suspended: 0 });
    expect(h.kinds()).toEqual(["final"]);

    const second = await h.runDay("2026-10-06");
    expect(second.daily).toMatchObject({ suspended: 1 });
  });

  it("does not suspend a current or in-grace customer", async () => {
    const h = await buildEnforcement();
    await h.addTenant("soon", { dueDate: "2026-10-05" });
    await h.addTenant("grace", { dueDate: "2026-10-03" });
    await walk(h, ["2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(await h.suspensions.findAll()).toEqual([]);
  });
});

describe("notices", () => {
  it("sends each notice once however many times the pass runs", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });

    await h.runDay("2026-10-01");
    const again = await h.runDay("2026-10-01", 10);
    h.runs.runs.clear();
    await h.runDay("2026-10-01", 11);

    expect(again.daily).toEqual({ ran: false, skipped: "already_ran" });
    expect(h.kinds()).toEqual(["due_today"]);
  });

  it("does not resend the last reminder on later days", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    await walk(h, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(h.kinds().filter((k) => k === "final")).toHaveLength(1);
  });

  it("tells the customer how many days are left and when access is paused", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    await walk(h, ["2026-10-01", "2026-10-02"]);
    const final = h.mail.sent.find((m) => m.kind === "final");
    expect(final).toMatchObject({ to: "a@corp.test", dueDate: "2026-10-01", graceEndsOn: "2026-10-04", suspendOn: "2026-10-05", amountOwedNgn: 1000 });
    expect(final?.items).toEqual(["Invoice INV-a"]);
  });

  it("does not suspend when the notice cannot be delivered, and retries next day", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01" });
    h.mail.failAll = true;

    const failed = await h.runDay("2026-10-05");
    expect(failed.daily).toMatchObject({ notified: 0, suspended: 0 });
    expect(await h.suspensions.findOne("a")).toBeNull();
    const plan = await h.planner.plan(h.clock.now);
    expect(plan.deferred).toEqual([{ tenantId: "a", why: "no_notice_yet" }]);

    h.mail.failAll = false;
    const retried = await h.runDay("2026-10-06");
    expect(retried.daily).toMatchObject({ notified: 1, suspended: 0 });
    expect(await h.suspensions.findOne("a")).toBeNull();

    const final = await h.runDay("2026-10-07");
    expect(final.daily).toMatchObject({ suspended: 1 });
  });

  it("lowering grace days never suspends before the date the final notice told", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    await walk(h, ["2026-10-01", "2026-10-02"]);
    await h.settings.update({ graceDays: 0 }, "t");

    await walk(h, ["2026-10-03", "2026-10-04"]);
    expect(await h.suspensions.findOne("a")).toBeNull();

    await h.runDay("2026-10-05");
    expect(await h.suspensions.findOne("a")).not.toBeNull();
  });

  it("never suspends a customer nobody can email", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01", email: null });
    await walk(h, ["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(await h.suspensions.findOne("a")).toBeNull();
    expect(h.mail.sent).toEqual([]);
  });

  it("counts a notice as delivered when at least one recipient got it", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    h.notices.contacts.set("a", { customerName: "Name a", emails: ["bad@corp.test", "good@corp.test"] });
    h.mail.failFor.add("bad@corp.test");

    await h.runDay("2026-10-01");

    expect(h.mail.sent.map((m) => m.to)).toEqual(["good@corp.test"]);
    expect([...h.notices.notices.values()][0].status).toBe("sent");
  });
});

describe("cap", () => {
  it("suspends only the oldest customers up to the cap, the rest next day", async () => {
    const h = await buildEnforcement();
    await h.settings.update({ autoSuspendCapPerRun: 5 }, "t");
    for (let i = 0; i < 12; i += 1) await h.addTenant(`t${String(i).padStart(2, "0")}`, { dueDate: `2026-09-${String(10 + i)}` });
    await h.runDay("2026-10-01");

    const first = await h.runDay("2026-10-02");
    expect(first.daily).toMatchObject({ suspended: 5, capped: 7 });
    const suspended = (await h.suspensions.findAll()).map((row) => row.tenantId).sort();
    expect(suspended).toEqual(["t00", "t01", "t02", "t03", "t04"]);

    const second = await h.runDay("2026-10-03");
    expect(second.daily).toMatchObject({ suspended: 5, capped: 2 });
    expect(await h.suspensions.findAll()).toHaveLength(10);
  });
});

describe("manual suspensions", () => {
  it("are never overwritten and never restored by payment", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-09-01" });
    await h.suspension.suspend("a", {
      cause: "manual", reason: "Staff decision", actor: { id: "staff1", name: "Ada", role: "SUPER_ADMIN" },
    });
    await walk(h, ["2026-10-05", "2026-10-06"]);

    expect(await h.suspensions.findOne("a")).toMatchObject({ cause: "manual", reason: "Staff decision", suspendedBy: "staff1" });
    expect(h.actions()).not.toContain("system.tenant.auto_suspended");

    h.pay("a");
    await h.restore.onPaymentSettled("a", "invoice_paid");
    await h.runDay("2026-10-07");

    expect((await h.suspensions.findOne("a"))?.cause).toBe("manual");
    expect(await h.userStatus("a-u0")).toBe("disabled");
    expect(h.actions()).not.toContain("system.tenant.auto_restored");
  });
});

describe("audit", () => {
  it("writes every automatic action as the system actor with the reason stamp", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    await walk(h, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    h.pay("a");
    await h.restore.onPaymentSettled("a", "wallet_topup");

    expect(h.audits.length).toBeGreaterThan(0);
    expect(new Set(h.audits.map((a) => a.userId))).toEqual(new Set(["system"]));
    const suspended = h.audits.find((a) => a.action === "system.tenant.auto_suspended");
    expect(suspended?.summary).toContain(REASON);
    expect(suspended?.metadata).toMatchObject({ cause: "non_payment", reason: REASON, unpaidSince: "2026-10-01", graceDays: 3, owedNgn: 1000 });
    const restored = h.audits.find((a) => a.action === "system.tenant.auto_restored");
    expect(restored?.metadata).toMatchObject({ trigger: "wallet_topup" });
    expect(h.actions()).toContain("system.billing.enforcement_notice_sent");
    expect(h.actions()).toContain("system.billing.enforcement_run");
  });

  it("reports a suspension that cannot be finished, once", async () => {
    const h = await buildEnforcement();
    h.fleet.suspendTenantAssets.mockResolvedValue({ ok: false, message: "fleet down" } as never);
    await h.addTenant("a", { dueDate: "2026-09-01" });
    await h.runDay("2026-10-01");
    await h.runDay("2026-10-02");
    expect((await h.suspensions.findOne("a"))?.cascadeStatus).toBe("partial");

    for (let i = 0; i < MAX_SUSPEND_ATTEMPTS + 2; i += 1) await h.runDay("2026-10-02", 10 + (i % 8));

    expect(h.actions().filter((a) => a === "system.tenant.suspension_incomplete")).toHaveLength(1);
    expect(await h.userStatus("a-u0")).toBe("disabled");
  });
});

describe("concurrency", () => {
  it("runs one pass when two ticks overlap", async () => {
    const h = await buildEnforcement();
    await h.addTenant("a", { dueDate: "2026-10-01" });
    h.day("2026-10-01");

    await Promise.all([h.sweep.run(h.clock.now), h.sweep.run(h.clock.now)]);

    expect(h.kinds()).toEqual(["due_today"]);
  });
});
