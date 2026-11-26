import { describe, expect, it } from "vitest";
import { OVERDUE_SOURCE_STATUSES } from "@auth/installation/domain/installation-order";
import { notificationCopy, typeToggle } from "@auth/installation/domain/installer-notification";

describe("overdue jobs", () => {
  it("flags offers and accepted jobs that were never started", () => {
    expect(OVERDUE_SOURCE_STATUSES).toEqual(["assigned", "scheduled"]);
  });

  it("tells the installer the job is overdue", () => {
    const copy = notificationCopy("job_overdue", { jobNumber: "FL-1001", scheduledDate: new Date("2026-10-30T00:00:00Z"), timeSlot: "morning" });
    expect(copy.title).toBe("Job #FL-1001 is overdue");
    expect(copy.body).toContain("30 October");
    expect(typeToggle("job_overdue")).toBe("jobAndIssueUpdates");
  });
});
