import { describe, expect, it } from "vitest";
import {
  computeTiming,
  noticeDedupKey,
  noticeKindFor,
  suspensionReason,
} from "../../../apps/auth/src/contexts/onboarding/domain/enforcement-stage";

describe("grace stage maths", () => {
  const due = "2026-10-01";

  it("is current on the due day itself", () => {
    expect(computeTiming(due, 3, "2026-10-01")).toEqual({
      stage: "current",
      graceEndsOn: "2026-10-04",
      daysOverdue: 0,
      graceDaysLeft: null,
    });
  });

  it("is current before the due day", () => {
    expect(computeTiming(due, 3, "2026-09-28").stage).toBe("current");
  });

  it("is in grace the day after, with 2 days left", () => {
    expect(computeTiming(due, 3, "2026-10-02")).toMatchObject({ stage: "in_grace", daysOverdue: 1, graceDaysLeft: 2 });
  });

  it("is still in grace on day 3 and on the last grace day", () => {
    expect(computeTiming(due, 3, "2026-10-03")).toMatchObject({ stage: "in_grace", graceDaysLeft: 1 });
    expect(computeTiming(due, 3, "2026-10-04")).toMatchObject({ stage: "in_grace", graceDaysLeft: 0, daysOverdue: 3 });
  });

  it("is past grace from day 4", () => {
    expect(computeTiming(due, 3, "2026-10-05")).toMatchObject({ stage: "past_grace", daysOverdue: 4, graceDaysLeft: 0 });
  });

  it("with grace 0 goes straight from current to past grace", () => {
    expect(computeTiming(due, 0, "2026-10-01").stage).toBe("current");
    expect(computeTiming(due, 0, "2026-10-02").stage).toBe("past_grace");
  });

  it("crosses month and year ends", () => {
    expect(computeTiming("2026-12-30", 3, "2027-01-02").stage).toBe("in_grace");
    expect(computeTiming("2026-12-30", 3, "2027-01-03").stage).toBe("past_grace");
  });

  it("stamps the exact reason text", () => {
    expect(suspensionReason(due, 3)).toBe("Unpaid since 2026-10-01, grace of 3 days ended");
  });
});

describe("notice schedule", () => {
  const due = "2026-10-01";
  const kind = (today: string, graceDays = 3, finalSent = false) =>
    noticeKindFor({ dueDate: due, graceDays, today, finalSent });

  it("sends nothing before the due day", () => {
    expect(kind("2026-09-30")).toBeNull();
  });

  it("sends due_today on the due day", () => {
    expect(kind("2026-10-01")).toBe("due_today");
  });

  it("sends grace_daily inside grace and the final notice the day before grace ends", () => {
    expect(kind("2026-10-02", 3, true)).toBe("grace_daily");
    expect(kind("2026-10-03")).toBe("final");
  });

  it("catches up with a final notice on first sight of a customer already in grace", () => {
    expect(kind("2026-10-02", 3, false)).toBe("final");
  });

  it("final wins on the last grace day only when it was never sent", () => {
    expect(kind("2026-10-04", 3, false)).toBe("final");
    expect(kind("2026-10-04", 3, true)).toBe("grace_daily");
  });

  it("with grace 0 the due day carries the final notice", () => {
    expect(kind("2026-10-01", 0)).toBe("final");
  });

  it("sends a catch-up final once past grace if none was sent, then nothing", () => {
    expect(kind("2026-10-06", 3, false)).toBe("final");
    expect(kind("2026-10-06", 3, true)).toBeNull();
  });

  it("builds dedup keys: final once per debt, others once per day", () => {
    const base = { tenantId: "t1", unpaidSince: due };
    expect(noticeDedupKey({ ...base, kind: "final", today: "2026-10-03" })).toBe("t1|final|2026-10-01");
    expect(noticeDedupKey({ ...base, kind: "grace_daily", today: "2026-10-02" })).toBe(
      "t1|grace_daily|2026-10-01|2026-10-02",
    );
  });
});
