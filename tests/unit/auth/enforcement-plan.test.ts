import { describe, expect, it } from "vitest";
import { buildEnforcementPlan } from "../../../apps/auth/src/enforcement-plan.service";
import type { EnforcementStagedRow } from "../../../apps/auth/src/enforcement-queries.repository";
import type { EnforcementSettings } from "../../../apps/auth/src/enforcement-settings.repository";

const settings = (over: Partial<EnforcementSettings> = {}): EnforcementSettings => ({
  graceDays: 3,
  autoSuspendEnabled: true,
  autoSuspendCapPerRun: 10,
  paused: false,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const row = (over: Partial<EnforcementStagedRow> = {}): EnforcementStagedRow => ({
  tenantId: "t1",
  tenantName: "Acme",
  dueDate: "2026-10-01",
  graceEndsOn: "2026-10-04",
  stage: "past_grace",
  owedKobo: 100_000,
  items: 1,
  sources: ["invoice"],
  suspendedAt: null,
  suspensionCause: null,
  reason: null,
  cascadeStatus: null,
  hasContact: true,
  lastNoticeKind: null,
  lastNoticeAt: null,
  waived: false,
  sentNoticeKeys: [],
  finalNoticeSentEarlier: true,
  ...over,
});

describe("enforcement plan", () => {
  const today = "2026-10-05";

  it("is empty when there is no billing data", () => {
    const plan = buildEnforcementPlan([], settings(), today);
    expect(plan).toMatchObject({ rows: [], wouldNotify: [], wouldSuspend: [], deferred: [], totalEligible: 0 });
  });

  it("suspends a customer past grace with a prior notice", () => {
    const plan = buildEnforcementPlan([row()], settings(), today);
    expect(plan.wouldSuspend.map((r) => r.tenantId)).toEqual(["t1"]);
    expect(plan.totalEligible).toBe(1);
  });

  it("does not suspend one still in grace or current", () => {
    const plan = buildEnforcementPlan(
      [row({ tenantId: "a", stage: "in_grace" }), row({ tenantId: "b", stage: "current" })],
      settings(),
      "2026-10-03",
    );
    expect(plan.wouldSuspend).toEqual([]);
    expect(plan.deferred).toEqual([]);
  });

  it("never touches a tenant that already has a suspension row, whatever the cause", () => {
    const plan = buildEnforcementPlan(
      [row({ suspendedAt: "2026-10-02T00:00:00Z", suspensionCause: "manual" })],
      settings(),
      today,
    );
    expect(plan.wouldSuspend).toEqual([]);
    expect(plan.deferred).toEqual([]);
    expect(plan.rows[0]).toMatchObject({ suspended: true, suspensionCause: "manual" });
  });

  it("defers with a reason: waived, no contact, no earlier notice", () => {
    const plan = buildEnforcementPlan(
      [
        row({ tenantId: "w", waived: true }),
        row({ tenantId: "c", hasContact: false }),
        row({ tenantId: "n", finalNoticeSentEarlier: false }),
      ],
      settings(),
      today,
    );
    expect(plan.deferred).toEqual([
      { tenantId: "c", why: "no_contact" },
      { tenantId: "n", why: "no_notice_yet" },
      { tenantId: "w", why: "waived" },
    ]);
    expect(plan.wouldSuspend).toEqual([]);
  });

  it("orders oldest due date first, then larger debt, then id, and applies the cap", () => {
    const plan = buildEnforcementPlan(
      [
        row({ tenantId: "c", dueDate: "2026-10-01", owedKobo: 50 }),
        row({ tenantId: "b", dueDate: "2026-10-01", owedKobo: 900 }),
        row({ tenantId: "a", dueDate: "2026-09-20", owedKobo: 10 }),
      ],
      settings({ autoSuspendCapPerRun: 2 }),
      today,
    );
    expect(plan.wouldSuspend.map((r) => r.tenantId)).toEqual(["a", "b"]);
    expect(plan.deferred).toEqual([{ tenantId: "c", why: "capped" }]);
    expect(plan.totalEligible).toBe(3);
  });

  it("uses one earliest due date for a customer with several unpaid items", () => {
    const plan = buildEnforcementPlan([row({ items: 3, dueDate: "2026-09-10" })], settings(), today);
    expect(plan.rows[0]).toMatchObject({ dueDate: "2026-09-10", items: 3 });
  });

  it("plans notices: final the day before grace ends, flagged when already sent", () => {
    const key = "t1|final|2026-10-01";
    const sent = buildEnforcementPlan(
      [row({ stage: "in_grace", sentNoticeKeys: [key] })],
      settings(),
      "2026-10-03",
    );
    expect(sent.wouldNotify).toEqual([{ tenantId: "t1", kind: "final", daysLeft: 1, alreadySent: true }]);
    const unsent = buildEnforcementPlan([row({ stage: "in_grace" })], settings(), "2026-10-03");
    expect(unsent.wouldNotify[0]).toMatchObject({ kind: "final", alreadySent: false });
  });

  it("sends no notices to customers with no contact, waived, or already suspended", () => {
    const plan = buildEnforcementPlan(
      [
        row({ tenantId: "a", stage: "in_grace", hasContact: false }),
        row({ tenantId: "b", stage: "in_grace", waived: true }),
        row({ tenantId: "c", stage: "in_grace", suspendedAt: "2026-10-02T00:00:00Z", suspensionCause: "manual" }),
      ],
      settings(),
      "2026-10-03",
    );
    expect(plan.wouldNotify).toEqual([]);
  });

  it("due_today notice carries no day count", () => {
    const plan = buildEnforcementPlan([row({ stage: "current" })], settings(), "2026-10-01");
    expect(plan.wouldNotify).toEqual([{ tenantId: "t1", kind: "due_today", daysLeft: null, alreadySent: false }]);
  });
});
