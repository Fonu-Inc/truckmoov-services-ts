import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLATION_ORDER_STATUSES,
  INSTALLATION_ORDER_TRANSITIONS,
  INSTALLATION_SLOT_LABELS,
  InMemoryInstallationJobReader,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
  InstallerAssignmentService,
  InstallerJobsUseCases,
  InvalidRejectionReasonError,
  ManageInstallationOrdersUseCases,
  RejectJobOfferUseCase,
  SweepInstallationOrdersUseCase,
  type StoredInstaller,
} from "@auth/installation";
import { slotWindow } from "@auth/installation/domain/installation-order";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import type { StoredOnboardingApplication } from "@auth/onboarding/domain/onboarding-application.repository";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { AccessResolver } from "../../../apps/auth/src/access-resolver";
import { InMemoryTenantRoleRepository } from "../../../apps/auth/src/in-memory-tenant-role.repository";
import { InMemoryPermissionRemovalRepository } from "../../../apps/auth/src/in-memory-permission-removal.repository";
import { Migration20260925010000 } from "../../../apps/auth/src/migrations/Migration20260925010000";

const NOW = new Date("2026-09-24T10:00:00Z");

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function installer(id: string, overrides: Partial<StoredInstaller> = {}): StoredInstaller {
  return {
    id, userId: `user-${id}`, code: `INS-${id}`, firstName: id, lastName: "Installer", fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`, phoneNumber: "+2348031234567", team: "", state: "Lagos", city: "Ikeja", serviceAreas: ["Lagos"],
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, status: "active", maxActiveJobs: 3,
    lastActivityAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function order(id: string, overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id, orderNumber: `FL-${id}`, applicationId: `app-${id}`, tenantId: `tenant-${id}`, scheduledDate: day("2026-09-30"),
    timeSlot: "morning", addressLine: "3 Creek Road", city: "Apapa", state: "Lagos", siteContactName: "Eko Haulage Ltd",
    siteContactPhone: "+2348021184471", notes: null, installerNotes: null, installerId: null, status: "unassigned",
    preExceptionStatus: null, assignedAt: null, acceptedAt: null, startedAt: null, issueReportedAt: null, completedAt: null,
    cancelledAt: null, reminderSentAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function application(id: string, organizationName: string): StoredOnboardingApplication {
  return {
    id: `app-${id}`, reference: `APP-${id}`, tokenHash: "hash", applicantType: "fleet_provider", organizationName,
    businessEmail: `fleet@${id}.ng`, organizationPhone: "+2348000000000", contactFullName: "Jane Doe", contactRole: null,
    streetAddress: "Street", city: "Apapa", state: "Lagos", rcNumber: null, taxIdentificationNumber: null, identificationType: null,
    identificationNumber: null, m2mPlanCode: null, billingEmail: null, billingEmailVerifiedAt: null, stage: "installation",
    emailVerifiedAt: NOW, phoneVerifiedAt: NOW, status: "approved", submittedAt: NOW, reviewedBy: null, reviewedAt: null,
    decisionReason: null, tenantId: `tenant-${id}`, setupLinkStatus: null, setupLinkSentAt: null, setupLinkError: null,
    setupLinkAttempts: 0, createdAt: NOW, updatedAt: NOW,
  };
}

function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const applications = new InMemoryOnboardingApplicationRepository();
  const reader = new InMemoryInstallationJobReader(orders, applications, installers);
  const tokens = { resolveAccessToken: (token: string) => ({ id: token }) };
  const notifier = { notify: vi.fn(async () => {}) };
  const assignment = new InstallerAssignmentService(installers, orders);
  const reject = new RejectJobOfferUseCase(tokens as never, installers, orders, assignment, notifier as never);
  const sweep = new SweepInstallationOrdersUseCase(orders, assignment, notifier as never);
  const lookup = { forTenant: vi.fn(async () => new Map()) };
  const jobs = new InstallerJobsUseCases(
    tokens as never, installers, orders, reader, applications, lookup, new InMemorySimRepository(), new InMemorySupportTicketRepository(),
  );

  async function job(id: string, overrides: Partial<StoredInstallationOrder>, name = `Customer ${id}`) {
    await applications.save(application(id, name));
    await orders.save(order(id, overrides));
  }

  return { installers, orders, applications, reader, notifier, reject, sweep, jobs, job };
}

type Harness = ReturnType<typeof harness>;

describe("the slot as instants", () => {
  it("is the stored Lagos day at the slot's hours, in UTC", () => {
    expect(slotWindow(day("2026-09-26"), "morning")).toEqual({
      start: new Date("2026-09-26T07:00:00Z"),
      end: new Date("2026-09-26T11:00:00Z"),
    });
    expect(slotWindow(day("2026-09-26"), "afternoon")).toEqual({
      start: new Date("2026-09-26T11:00:00Z"),
      end: new Date("2026-09-26T16:00:00Z"),
    });
  });

  it("keeps the labels the customer screens read", () => {
    expect(INSTALLATION_SLOT_LABELS).toEqual({ morning: "Morning (8:00 – 12:00)", afternoon: "Afternoon (12:00 – 17:00)" });
  });
});

describe("offers without an accepted status", () => {
  it("has no accepted status; accepting schedules the offer, rejecting hands it back", () => {
    expect(INSTALLATION_ORDER_STATUSES).not.toContain("accepted");
    expect(INSTALLATION_ORDER_TRANSITIONS.assigned).toEqual(["scheduled", "overdue", "issue_reported", "cancelled", "unassigned"]);
    expect(Object.values(INSTALLATION_ORDER_TRANSITIONS).flat()).not.toContain("accepted");
  });

  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20260925010000.prototype) as Migration20260925010000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("migrates accepted jobs and paused ones to scheduled, and adds the rejection table", () => {
    const up = sql("up");
    expect(up).toMatch(/set "status" = 'scheduled' where "status" = 'accepted'/);
    expect(up).toMatch(/set "pre_exception_status" = 'scheduled' where "pre_exception_status" = 'accepted'/);
    expect(up).toMatch(/create table if not exists "installation_offer_rejections"/);
    expect(up).toMatch(/primary key \("order_id", "installer_id"\)/);
  });

  it("drops only the table on the way down: moved jobs cannot be told apart", () => {
    const down = sql("down");
    expect(down).toMatch(/drop table if exists "installation_offer_rejections"/);
    expect(down).not.toMatch(/accepted/);
  });
});

describe("rejecting an offer", () => {
  let h: Harness;

  beforeEach(async () => {
    h = harness();
    await h.installers.save(installer("ada"));
    await h.installers.save(installer("bola"));
    await h.job("o1", { status: "assigned", installerId: "ada", assignedAt: new Date("2026-09-23T09:00:00Z") });
  });

  it("records the trimmed reason and offers the job to the next installer at once", async () => {
    const result = await h.reject.execute("user-ada", "o1", "  Too far from my route  ", NOW);

    expect(result).toEqual({ id: "o1", jobNumber: "FL-o1", rejectedAt: NOW.toISOString() });
    expect(await h.orders.findOfferRejections(["o1"])).toEqual([
      { orderId: "o1", installerId: "ada", reason: "Too far from my route", rejectedAt: NOW },
    ]);
    expect(await h.orders.findById("o1")).toMatchObject({ status: "assigned", installerId: "bola", assignedAt: NOW, acceptedAt: null });
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
    expect(h.notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_assigned", order: expect.objectContaining({ installerId: "bola" }) }),
      NOW,
    );
  });

  it("goes back to unassigned, with no installer, when only rejecters could take it", async () => {
    await h.reject.execute("user-ada", "o1", "Too far from my route", NOW);
    await h.reject.execute("user-bola", "o1", "Vehicle not ready", NOW);

    expect(await h.orders.findById("o1")).toMatchObject({ status: "unassigned", installerId: null, assignedAt: null });
    expect((await h.orders.findOfferRejections(["o1"])).map((r) => r.installerId)).toEqual(["ada", "bola"]);
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
  });

  it("is refused once the offer is accepted, or on any status but assigned", async () => {
    for (const status of ["scheduled", "overdue", "in_progress", "issue_reported", "completed", "cancelled"] as const) {
      await h.orders.save(order("o1", { status, installerId: "ada" }));
      await expect(h.reject.execute("user-ada", "o1", "Too far from my route", NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    }
    expect(await h.orders.findOfferRejections(["o1"])).toEqual([]);
  });

  it("answers another installer's offer exactly like a missing one", async () => {
    await expect(h.reject.execute("user-bola", "o1", "Too far from my route", NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.reject.execute("user-ada", "nope", "Too far from my route", NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    expect(await h.orders.findById("o1")).toMatchObject({ status: "assigned", installerId: "ada" });
  });

  it("needs a reason of 3 to 500 characters after trimming", async () => {
    for (const reason of [undefined, 42, "", "   ", "  no  ", "x".repeat(501)]) {
      await expect(h.reject.execute("user-ada", "o1", reason, NOW)).rejects.toBeInstanceOf(InvalidRejectionReasonError);
    }
    expect(await h.orders.findById("o1")).toMatchObject({ status: "assigned", installerId: "ada" });

    await h.reject.execute("user-ada", "o1", ` ${"x".repeat(500)} `, NOW);
    expect((await h.orders.findOfferRejections(["o1"]))[0].reason).toHaveLength(500);
  });

  it("is never swept back to a rejecter, but is to a newcomer", async () => {
    await h.installers.save(installer("bola", { status: "suspended" }));
    await h.reject.execute("user-ada", "o1", "Too far from my route", NOW);
    expect((await h.orders.findById("o1"))?.status).toBe("unassigned");

    expect((await h.sweep.run(NOW)).assigned).toBe(0);
    expect(await h.orders.findById("o1")).toMatchObject({ status: "unassigned", installerId: null });

    await h.installers.save(installer("chidi"));
    expect((await h.sweep.run(NOW)).assigned).toBe(1);
    expect((await h.orders.findById("o1"))?.installerId).toBe("chidi");
  });

  it("refuses a rejecter at the write even when the assigner was not told", async () => {
    await h.installers.save(installer("bola", { status: "suspended" }));
    await h.reject.execute("user-ada", "o1", "Too far from my route", NOW);
    const assign = await new InstallerAssignmentService(h.installers, h.orders).assigner();

    expect(await assign((await h.orders.findById("o1"))!, NOW)).toBeNull();
    expect((await h.orders.findById("o1"))?.status).toBe("unassigned");
  });

  it("shows platform staff every rejection on the job", async () => {
    const users = new InMemoryUserRepository();
    await users.save({ id: "platform", email: "p@co.com", passwordHash: "x", role: "PLATFORM_ADMIN", tenantId: "system" });
    const admin = new ManageInstallationOrdersUseCases(
      h.orders, h.reader, h.installers, { forTenant: async () => new Map() },
      { resolveAccessToken: (t: string) => (t === "platform" ? { id: t, email: "p@co.com", role: "PLATFORM_ADMIN" } : null) } as never,
      users, new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository()),
      { record: vi.fn() } as never, new InMemorySupportTicketRepository(),
    );
    await h.reject.execute("user-ada", "o1", "Too far from my route", NOW);

    const detail = await admin.detail("platform", "o1");
    expect(detail).toMatchObject({ id: "o1", jobNumber: "FL-o1", status: "assigned", installer: { id: "bola" } });
    expect(detail.offerRejections).toEqual([
      { installerId: "ada", installerName: "ada Installer", reason: "Too far from my route", rejectedAt: NOW.toISOString() },
    ]);
    await expect(admin.detail("platform", "nope")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });
});

describe("the installer dashboard", () => {
  let h: Harness;
  const mine = { installerId: "ada" };

  beforeEach(async () => {
    h = harness();
    await h.installers.save(installer("ada"));
    await h.installers.save(installer("bola"));
  });

  it("counts every job but offers, with pending and a rounded success rate", async () => {
    const statuses = [
      ...Array(9).fill("scheduled"), ...Array(4).fill("in_progress"), "overdue", "issue_reported", "completed", "cancelled", "issue_reported",
    ] as StoredInstallationOrder["status"][];
    for (const [i, status] of statuses.entries()) await h.job(`j${i}`, { ...mine, status });
    for (const i of [1, 2]) await h.job(`offer${i}`, { ...mine, status: "assigned" });
    await h.job("other", { installerId: "bola", status: "completed" });

    expect((await h.jobs.dashboard("user-ada", NOW)).counters).toEqual({ total: 18, completed: 1, pending: 16, successRate: 6 });
  });

  it("answers zero success with no jobs", async () => {
    await h.job("offer", { ...mine, status: "assigned" });
    expect((await h.jobs.dashboard("user-ada", NOW)).counters).toEqual({ total: 0, completed: 0, pending: 0, successRate: 0 });
  });

  it("lists offers soonest first by day then slot, five at most, with the card fields", async () => {
    await h.job("late", { ...mine, status: "assigned", scheduledDate: day("2026-10-02") });
    await h.job("pm", { ...mine, status: "assigned", scheduledDate: day("2026-09-26"), timeSlot: "afternoon" }, "Eko Haulage Ltd");
    await h.job("am", { ...mine, status: "assigned", scheduledDate: day("2026-09-26"), timeSlot: "morning" });
    for (const id of ["x1", "x2", "x3"]) await h.job(id, { ...mine, status: "assigned", scheduledDate: day("2026-09-28") });
    await h.job("bola", { installerId: "bola", status: "assigned", scheduledDate: day("2026-09-25") });

    const { offers } = await h.jobs.dashboard("user-ada", NOW);

    expect(offers.total).toBe(6);
    expect(offers.items.map((item) => item.jobId)).toEqual(["am", "pm", "x1", "x2", "x3"]);
    expect(offers.items[1]).toEqual({
      jobId: "pm", jobNumber: "FL-pm", companyName: "Eko Haulage Ltd", siteContactName: "Eko Haulage Ltd",
      siteContactPhone: "+2348021184471", siteContactEmail: "fleet@pm.ng", address: "3 Creek Road", city: "Apapa", state: "Lagos",
      scheduledAt: "2026-09-26T11:00:00.000Z", scheduledUntil: "2026-09-26T16:00:00.000Z", status: "assigned",
    });
  });

  it("splits today's and upcoming jobs on the Lagos day", async () => {
    const lateEvening = new Date("2026-09-24T23:30:00Z");
    await h.job("today", { ...mine, status: "scheduled", scheduledDate: day("2026-09-25") });
    await h.job("working", { ...mine, status: "in_progress", scheduledDate: day("2026-09-25") });
    await h.job("paused", { ...mine, status: "issue_reported", preExceptionStatus: "scheduled", scheduledDate: day("2026-09-25") });
    await h.job("offer", { ...mine, status: "assigned", scheduledDate: day("2026-09-25") });
    await h.job("done", { ...mine, status: "completed", scheduledDate: day("2026-09-25") });
    await h.job("yesterday", { ...mine, status: "scheduled", scheduledDate: day("2026-09-24") });
    await h.job("tomorrow", { ...mine, status: "scheduled", scheduledDate: day("2026-09-26") });
    await h.job("later", { ...mine, status: "scheduled", scheduledDate: day("2026-10-05") });
    await h.job("laterWork", { ...mine, status: "issue_reported", scheduledDate: day("2026-10-05") });

    const dashboard = await h.jobs.dashboard("user-ada", lateEvening);

    expect(dashboard.todaysJobs.items.map((item) => item.jobId).sort()).toEqual(["paused", "today", "working"]);
    expect(dashboard.todaysJobs.total).toBe(3);
    expect(dashboard.upcomingJobs.items.map((item) => item.jobId)).toEqual(["tomorrow", "later"]);

    const earlier = await h.jobs.dashboard("user-ada", new Date("2026-09-24T22:59:59Z"));
    expect(earlier.todaysJobs.items.map((item) => item.jobId)).toEqual(["yesterday"]);
    expect(earlier.upcomingJobs.items.map((item) => item.jobId)).toEqual(["today", "tomorrow", "later"]);
  });

  it("counts six Lagos months of activity, current one last, by each measure's own stamp", async () => {
    const lagosOctober = new Date("2026-09-30T23:30:00Z");
    await h.job("c1", { ...mine, status: "completed", startedAt: new Date("2026-08-31T22:30:00Z"), completedAt: new Date("2026-08-31T23:30:00Z") });
    await h.job("c2", { ...mine, status: "completed", startedAt: new Date("2026-08-31T22:00:00Z"), completedAt: new Date("2026-08-31T22:59:00Z") });
    await h.job("s1", { ...mine, status: "scheduled", scheduledDate: day("2026-10-01") });
    await h.job("s2", { ...mine, status: "scheduled", scheduledDate: day("2026-09-30") });
    await h.job("offer", { ...mine, status: "assigned", scheduledDate: day("2026-10-01") });
    await h.job("old", { ...mine, status: "completed", scheduledDate: day("2026-04-10"), completedAt: new Date("2026-04-30T22:59:00Z") });
    await h.job("may", { ...mine, status: "completed", scheduledDate: day("2026-05-02"), completedAt: new Date("2026-04-30T23:00:00Z") });
    await h.job("bola", { installerId: "bola", status: "completed", completedAt: new Date("2026-09-10T10:00:00Z") });

    const { activityOverTime } = await h.jobs.dashboard("user-ada", lagosOctober);

    expect(activityOverTime.map((m) => m.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(activityOverTime).toContainEqual({ month: "2026-05", completed: 1, inProgress: 0, scheduled: 1 });
    expect(activityOverTime).toContainEqual({ month: "2026-08", completed: 1, inProgress: 2, scheduled: 0 });
    expect(activityOverTime).toContainEqual({ month: "2026-09", completed: 1, inProgress: 0, scheduled: 3 });
    expect(activityOverTime).toContainEqual({ month: "2026-10", completed: 0, inProgress: 0, scheduled: 1 });
  });

  it("reads recent activity from the order stamps, newest first, ten at most", async () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 8, 20, hour));
    await h.job("a", { ...mine, status: "completed", assignedAt: at(1), acceptedAt: at(2), startedAt: at(3), completedAt: at(4) });
    await h.job("b", { ...mine, status: "cancelled", assignedAt: at(5), cancelledAt: at(6) });
    await h.job("c", { ...mine, status: "issue_reported", assignedAt: at(7), acceptedAt: at(7), startedAt: at(8), issueReportedAt: at(9) });
    await h.job("d", { ...mine, status: "assigned", assignedAt: at(10) });
    await h.job("e", { installerId: "bola", status: "assigned", assignedAt: at(11) });

    const { recentActivity } = await h.jobs.dashboard("user-ada", NOW);

    expect(recentActivity.map((event) => `${event.jobId}:${event.type}`)).toEqual([
      "d:offered", "c:issue_reported", "c:started", "c:accepted", "c:offered", "b:cancelled", "b:offered", "a:completed", "a:started", "a:accepted",
    ]);
    expect(recentActivity[0]).toEqual({ type: "offered", jobId: "d", jobNumber: "FL-d", occurredAt: at(10).toISOString() });
  });
});
