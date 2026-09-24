import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminJobChangesUseCases,
  InMemoryInstallationJobReader,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerRepository,
  InMemoryJobIssueRecorder,
  InstallationJobClosedError,
  InstallationJobConflictError,
  InstallationJobNotFoundError,
  InstallerJobsUseCases,
  InstallerSupportUseCases,
  InstallerTicketContextService,
  ManageInstallationOrdersUseCases,
  ReportJobIssueUseCase,
  type StoredInstaller,
} from "@auth/installation";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";
import { InvalidInstallationDateError } from "@auth/installation/domain/installation-order";
import { InMemoryOnboardingApplicationRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-onboarding-application.repository";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySimRepository } from "../../../apps/auth/src/in-memory-sim.repository";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { InMemorySupportTicketAttachmentRepository } from "../../../apps/auth/src/in-memory-support-ticket-attachment.repository";
import { ListMySupportTicketsUseCase } from "../../../apps/auth/src/list-my-support-tickets.use-case";
import { ListSystemSupportTicketsUseCase } from "../../../apps/auth/src/list-system-support-tickets.use-case";
import { GetSystemSupportTicketUseCase } from "../../../apps/auth/src/get-system-support-ticket.use-case";
import { InMemorySupportMessageRepository } from "../../../apps/auth/src/in-memory-support-message.repository";
import { AccessResolver } from "../../../apps/auth/src/access-resolver";
import { InMemoryTenantRoleRepository } from "../../../apps/auth/src/in-memory-tenant-role.repository";
import { InMemoryPermissionRemovalRepository } from "../../../apps/auth/src/in-memory-permission-removal.repository";
import { TENANT_USER_REPORTER, type StoredSupportTicket } from "../../../apps/auth/src/support-ticket.repository";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session";

const NOW = new Date("2026-09-24T10:00:00Z");
const TENANT = "tenant-1";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const TICKET = { category: "device_hardware", priority: "high", description: "Unit will not power up", callbackPhone: "0803 221 4478" };

function installer(id: string): StoredInstaller {
  return {
    id, userId: `user-${id}`, code: `INS-${id}`, firstName: id, lastName: "Installer", fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`, phoneNumber: "+2348031234567", team: "", state: "Lagos", city: "Ikeja", serviceAreas: ["Lagos"],
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, status: "active", maxActiveJobs: 3,
    lastActivityAt: null, createdAt: NOW, updatedAt: NOW,
  };
}

function order(overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id: "job-1", orderNumber: "FL-1000", applicationId: "app-1", tenantId: TENANT, scheduledDate: new Date("2026-09-25T00:00:00Z"),
    timeSlot: "morning", addressLine: "14 Kudirat Abiola Way", city: "Ikeja", state: "Lagos", siteContactName: "Ada Obi",
    siteContactPhone: "+2347014452219", notes: null, installerNotes: null, installerId: "ada", status: "accepted",
    preExceptionStatus: null, assignedAt: NOW, acceptedAt: NOW, startedAt: null, issueReportedAt: null, completedAt: null,
    cancelledAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function tenantTicket(): StoredSupportTicket {
  return {
    id: "tenant-ticket", ticketNumber: 1, tenantId: TENANT, ...TENANT_USER_REPORTER, category: "billing", subject: "Invoice",
    description: "Wrong total", status: "open", priority: "low", channel: "billing", otherChannel: null, contextType: "none",
    contextId: null, contextSnapshot: null, escalatedTo: null, escalatedReferenceId: null, escalationNotes: null, escalatedAt: null,
    escalatedBy: null, assignedTo: null, createdBy: "tenant-user", resolvedAt: null, closedAt: null, createdAt: NOW, updatedAt: NOW,
  };
}

function photo(buffer: Buffer, originalname = "broken harness.png") {
  return { originalname, mimetype: "image/png", size: buffer.length, buffer };
}

async function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const applications = new InMemoryOnboardingApplicationRepository();
  const tickets = new InMemorySupportTicketRepository();
  const attachments = new InMemorySupportTicketAttachmentRepository();
  const files = {
    store: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    downloadUrl: vi.fn(async (key: string) => `https://signed/${key}`),
  };
  const scanner = { scan: vi.fn(async () => ({ scanned: true, clean: true })) };
  const notifier = { notifyRaised: vi.fn(async () => {}) };
  const activity = { record: vi.fn(async () => ({})) };
  const tokens = { resolveAccessToken: (token: string) => ({ id: token, email: `${token}@co.com`, role: token === "platform" ? "PLATFORM_ADMIN" : "INSTALLER" }) };
  const config = { fleet: { documentScanRequired: true } };
  const recorder = new InMemoryJobIssueRecorder(orders, tickets, attachments);

  const support = new InstallerSupportUseCases(tokens as never, installers, orders, tickets, attachments, files, notifier as never, activity as never);
  const alerts = { raise: vi.fn(async () => {}) };
  const report = new ReportJobIssueUseCase(
    tokens as never, installers, orders, tickets, recorder, files, scanner, notifier as never, activity as never, config as never,
    alerts as never,
  );
  const reader = new InMemoryInstallationJobReader(orders, applications, installers);
  const lookup = { forTenant: vi.fn(async () => new Map()) };
  const jobs = new InstallerJobsUseCases(tokens as never, installers, orders, reader, applications, lookup, new InMemorySimRepository(), tickets);

  const users = new InMemoryUserRepository();
  await users.save({ id: "platform", email: "p@co.com", passwordHash: "x", role: "PLATFORM_ADMIN", tenantId: "system" });
  const access = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());
  const installerNotifier = { notify: vi.fn(async () => {}) };
  const changes = new AdminJobChangesUseCases(orders, tokens as never, users, access, activity as never, installerNotifier as never);
  const admin = new ManageInstallationOrdersUseCases(orders, reader, installers, lookup, tokens as never, users, access, activity as never, tickets);

  await installers.save(installer("ada"));
  await installers.save(installer("bola"));
  await orders.save(order());

  return {
    installers, orders, tickets, attachments, files, scanner, notifier, activity, recorder, support, report, jobs, changes, admin, alerts,
    installerNotifier,
  };
}

type Harness = Awaited<ReturnType<typeof harness>>;

describe("raising an installer ticket", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("stores it under the system tenant, numbered, with the derived subject and channel", async () => {
    const first = await h.support.create("user-ada", TICKET, NOW);
    const second = await h.support.create(
      "user-ada",
      { ...TICKET, category: "configuration_setup", issueCode: "firmware_out_of_date", relatedJobId: "job-1", priority: "medium" },
      NOW,
    );

    expect(first).toMatchObject({ displayId: "#tkt-1000", title: "Device & Hardware", channel: "device", status: "open", relatedJob: null });
    expect(second).toMatchObject({
      displayId: "#tkt-1001",
      title: "Configuration & Setup — Firmware version is out of date",
      relatedJob: { id: "job-1", jobNumber: "FL-1000" },
      reporter: "ada Installer",
    });
    expect(await h.tickets.findById(second.id)).toMatchObject({
      tenantId: "system", reporterType: "installer", reporterId: "ada", relatedTenantId: TENANT, relatedOrderId: "job-1",
      issueCode: "firmware_out_of_date", callbackPhone: "+2348032214478", contextType: "none", ticketNumber: 1001,
    });
    expect(h.notifier.notifyRaised).toHaveBeenCalledWith("system", first.id, expect.anything());
    expect(h.activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: "installer.support_ticket.created", tenantId: "system" }));
  });

  it("maps every category onto a ticket channel", async () => {
    const channels: Record<string, string> = {
      device_hardware: "device", configuration_setup: "device", sim_connectivity: "sim",
      job_scheduling: "other", site_access_safety: "other", account_tools: "other",
    };
    for (const [category, channel] of Object.entries(channels)) {
      const ticket = await h.support.create("user-ada", { ...TICKET, category, issueCode: "commands_rejected" }, NOW);
      expect(ticket.channel, category).toBe(channel);
    }
  });

  it("requires a chip only where the category has chips", async () => {
    await expect(h.support.create("user-ada", { ...TICKET, category: "configuration_setup" }, NOW)).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(
      h.support.create("user-ada", { ...TICKET, category: "configuration_setup", issueCode: "made_up" }, NOW),
    ).rejects.toBeInstanceOf(OnboardingValidationError);

    const unlisted = await h.support.create("user-ada", { ...TICKET, issueCode: "anything" }, NOW);
    expect((await h.tickets.findById(unlisted.id))?.issueCode).toBeNull();
  });

  it("refuses a bad category, priority, description or callback number", async () => {
    for (const bad of [
      { category: "billing" },
      { priority: "urgent" },
      { description: "   " },
      { description: "x".repeat(4001) },
      { callbackPhone: "12345" },
    ]) {
      await expect(h.support.create("user-ada", { ...TICKET, ...bad }, NOW)).rejects.toBeInstanceOf(OnboardingValidationError);
    }
  });

  it("answers another installer's job as missing", async () => {
    await expect(h.support.create("user-bola", { ...TICKET, relatedJobId: "job-1" }, NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.support.create("user-ada", { ...TICKET, relatedJobId: "nope" }, NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    expect(await h.tickets.findAll()).toEqual([]);
  });
});

describe("listing and reading installer tickets", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
    await h.support.create("user-ada", { ...TICKET, description: "Harness melted" }, at(1));
    await h.support.create("user-ada", { ...TICKET, category: "sim_connectivity", priority: "low" }, at(2));
    const third = await h.support.create("user-ada", { ...TICKET, category: "job_scheduling" }, at(3));
    await h.support.create("user-bola", TICKET, at(4));
    await h.tickets.save({ ...(await h.tickets.findById(third.id))!, status: "waiting_on_tenant" });
  });

  it("counts and lists only the caller's tickets, newest first", async () => {
    const list = await h.support.list("user-ada", {});

    expect(list.counts).toEqual({ total: 3, open: 2, inProgress: 0, escalated: 0, closed: 0 });
    expect(list.items.map((i) => i.displayId)).toEqual(["#tkt-1002", "#tkt-1001", "#tkt-1000"]);
    expect(list.items[0]).toMatchObject({
      title: "Job & Scheduling", message: TICKET.description, reporter: "ada Installer", channel: "other",
      category: "job_scheduling", categoryLabel: "Job & Scheduling", status: "waiting_on_tenant", statusLabel: "Awaiting Response",
    });
  });

  it("counts resolved and closed together as closed", async () => {
    const [first, second] = (await h.support.list("user-ada", {})).items;
    await h.tickets.save({ ...(await h.tickets.findById(first.id))!, status: "resolved" });
    await h.tickets.save({ ...(await h.tickets.findById(second.id))!, status: "closed" });

    expect((await h.support.list("user-ada", {})).counts).toMatchObject({ total: 3, open: 1, closed: 2 });
  });

  it("filters by status, category, priority and search, and pages", async () => {
    const ids = async (query: Parameters<Harness["support"]["list"]>[1]) =>
      (await h.support.list("user-ada", query)).items.map((i) => i.displayId);

    expect(await ids({ status: "waiting_on_tenant" })).toEqual(["#tkt-1002"]);
    expect(await ids({ category: "sim_connectivity" })).toEqual(["#tkt-1001"]);
    expect(await ids({ priority: "low" })).toEqual(["#tkt-1001"]);
    expect(await ids({ search: "#tkt-1000" })).toEqual(["#tkt-1000"]);
    expect(await ids({ search: "1001" })).toEqual(["#tkt-1001"]);
    expect(await ids({ search: "melted" })).toEqual(["#tkt-1000"]);
    expect(await ids({ search: "sim &" })).toEqual(["#tkt-1001"]);
    const page = await h.support.list("user-ada", { page: 2, limit: 2 });
    expect(page).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(page.items.map((i) => i.displayId)).toEqual(["#tkt-1000"]);
  });

  it("shows one ticket and its attachment link only to its reporter", async () => {
    const [mine] = (await h.support.list("user-ada", {})).items;
    await h.attachments.save({
      id: "att-1", ticketId: mine.id, tenantId: "system", messageId: null, key: "auth/support-tickets/installers/ada/x/att-1",
      filename: "harness.png", contentType: "image/png", sizeBytes: 40, uploadedBy: "user-ada", createdAt: NOW,
    });

    expect(await h.support.detail("user-ada", mine.id)).toMatchObject({
      displayId: mine.displayId, description: TICKET.description, attachments: [{ id: "att-1", fileName: "harness.png", size: 40, mimeType: "image/png" }],
    });
    expect(await h.support.attachmentLink("user-ada", mine.id, "att-1")).toMatchObject({
      url: "https://signed/auth/support-tickets/installers/ada/x/att-1",
    });
    await expect(h.support.detail("user-bola", mine.id)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.support.attachmentLink("user-bola", mine.id, "att-1")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    await expect(h.support.attachmentLink("user-ada", mine.id, "att-2")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("never shows a tenant's ticket to an installer", async () => {
    await h.tickets.save(tenantTicket());
    await expect(h.support.detail("user-ada", "tenant-ticket")).rejects.toBeInstanceOf(InstallationJobNotFoundError);
    expect((await h.support.list("user-ada", {})).counts.total).toBe(3);
  });
});

describe("tenant queues with installer tickets present", () => {
  it("still hold only the tenant's own tickets, even for a job at that tenant", async () => {
    const h = await harness();
    await h.tickets.save(tenantTicket());
    await h.support.create("user-ada", { ...TICKET, relatedJobId: "job-1" }, NOW);
    await h.report.execute("user-ada", "job-1", { issueType: "site_access_safety", description: "Gate locked" }, NOW);
    const user = { id: "tenant-user", email: "ops@t.com", role: "FLEET_ADMIN", tenantId: TENANT, accountStatus: "active" };
    const mine = new ListMySupportTicketsUseCase(
      { resolveAccessToken: () => ({ id: user.id }) } as never,
      { findById: async () => user } as never,
      h.tickets,
    );

    const listed = await mine.execute("token");
    expect(listed.data.tickets.map((t) => t.id)).toEqual(["tenant-ticket"]);
    expect(listed.data.countsByStatus.open).toBe(1);
    expect(await h.tickets.countByStatusForTenant(TENANT)).toEqual({ open: 1 });
    expect(listed.data.tickets[0]).toMatchObject({ displayId: "#tkt-1", reporterType: "tenant_user" });
    expect(await h.tickets.countByTenant()).toEqual([{ tenantId: TENANT, count: 1 }]);
  });
});

describe("reporting a job issue", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("raises the ticket and moves the job to issue_reported from every working status", async () => {
    for (const from of ["assigned", "accepted", "scheduled", "overdue", "in_progress"] as const) {
      await h.orders.save(order({ status: from, startedAt: from === "in_progress" ? NOW : null }));
      const issue = await h.report.execute("user-ada", "job-1", { issueType: "job_scheduling", description: "Customer away" }, NOW);

      expect(await h.orders.findById("job-1"), from).toMatchObject({ status: "issue_reported", preExceptionStatus: from, issueReportedAt: NOW });
      expect(await h.tickets.findById(issue.ticketId)).toMatchObject({
        tenantId: "system", reporterId: "ada", subject: "Job & Scheduling", contextType: "installation_job", contextId: "job-1",
        relatedOrderId: "job-1", relatedTenantId: TENANT, category: "job_scheduling", description: "Customer away",
      });
    }
    expect(h.activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: "installer.installation.issue_reported" }));
  });

  it("tells platform staff through an installation_issues alert", async () => {
    const issue = await h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "Harness melted" }, NOW);

    expect(h.alerts.raise).toHaveBeenCalledTimes(1);
    expect(h.alerts.raise).toHaveBeenCalledWith({
      alertType: "installation_issues",
      severity: "high",
      subject: "Installation issue reported on FL-1000",
      body: expect.stringContaining('ada Installer (INS-ada) reported "Device & Hardware" on FL-1000 (#tkt-'),
      context: expect.objectContaining({ orderId: "job-1", jobNumber: "FL-1000", orderTenantId: TENANT, installerId: "ada", ticketId: issue.ticketId }),
    });
  });

  it("raises no alert when the report does not land", async () => {
    vi.spyOn(h.tickets, "save").mockRejectedValueOnce(new Error("db down"));

    await expect(h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x" }, NOW)).rejects.toThrow("db down");
    expect(h.alerts.raise).not.toHaveBeenCalled();
  });

  it("refuses finished, cancelled or already reported jobs, and another installer's job", async () => {
    for (const status of ["completed", "cancelled", "issue_reported"] as const) {
      await h.orders.save(order({ status }));
      await expect(
        h.report.execute("user-ada", "job-1", { issueType: "job_scheduling", description: "x" }, NOW),
      ).rejects.toBeInstanceOf(InstallationJobConflictError);
    }
    await h.orders.save(order());
    await expect(h.report.execute("user-bola", "job-1", { issueType: "job_scheduling", description: "x" }, NOW)).rejects.toBeInstanceOf(
      InstallationJobNotFoundError,
    );
    await expect(h.report.execute("user-ada", "job-1", { issueType: "billing", description: "x" }, NOW)).rejects.toBeInstanceOf(
      OnboardingValidationError,
    );
    expect(await h.tickets.findAll()).toEqual([]);
  });

  it("stores the photo as a ticket attachment under the installer's key", async () => {
    const issue = await h.report.execute(
      "user-ada", "job-1", { issueType: "device_hardware", description: "Burnt", photo: photo(PNG) }, NOW,
    );

    const [attachment] = await h.attachments.findByTicketId(issue.ticketId);
    expect(attachment).toMatchObject({ tenantId: "system", filename: "broken-harness.png", contentType: "image/png", sizeBytes: PNG.length });
    expect(attachment.key).toBe(`auth/support-tickets/installers/ada/${issue.ticketId}/${attachment.id}`);
    expect(h.files.store).toHaveBeenCalledWith(attachment.key, expect.objectContaining({ mimeType: "image/png" }));
  });

  it("refuses a photo that is not an image, too large, or flagged, before anything is written", async () => {
    const report = (buffer: Buffer) =>
      h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x", photo: photo(buffer) }, NOW);

    await expect(report(Buffer.from("%PDF-1.7 not a photo"))).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(report(Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]))).rejects.toBeInstanceOf(OnboardingValidationError);
    h.scanner.scan.mockResolvedValueOnce({ scanned: true, clean: false });
    await expect(report(PNG)).rejects.toBeInstanceOf(OnboardingValidationError);
    h.scanner.scan.mockResolvedValueOnce({ scanned: false, clean: false });
    await expect(report(PNG)).rejects.toBeInstanceOf(OnboardingValidationError);

    expect(h.files.store).not.toHaveBeenCalled();
    expect((await h.orders.findById("job-1"))?.status).toBe("accepted");
  });

  for (const failing of ["tickets", "attachments"] as const) {
    it(`leaves no half state when the ${failing} write fails: job unchanged, no rows, photo removed`, async () => {
      vi.spyOn(h[failing], "save").mockRejectedValueOnce(new Error("db down"));

      await expect(
        h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x", photo: photo(PNG) }, NOW),
      ).rejects.toThrow("db down");

      expect(await h.orders.findById("job-1")).toMatchObject({ status: "accepted", preExceptionStatus: null, issueReportedAt: null });
      expect(await h.tickets.findAll()).toEqual([]);
      const key = (h.files.store.mock.calls[0] as unknown as [string])[0];
      const ticketId = key.split("/").at(-2)!;
      expect(await h.attachments.findByTicketId(ticketId)).toEqual([]);
      expect(h.files.remove).toHaveBeenCalledWith(key);
    });
  }

  it("refuses and removes the photo when the job moved meanwhile", async () => {
    vi.spyOn(h.recorder, "record").mockResolvedValueOnce(false);

    await expect(
      h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x", photo: photo(PNG) }, NOW),
    ).rejects.toBeInstanceOf(InstallationJobConflictError);
    expect(h.files.remove).toHaveBeenCalledTimes(1);
    expect(h.notifier.notifyRaised).not.toHaveBeenCalled();
  });

  it("lists the reports on the job detail", async () => {
    const issue = await h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x" }, NOW);
    await h.support.create("user-ada", { ...TICKET, relatedJobId: "job-1" }, NOW);

    const detail = await h.jobs.detail("user-ada", "job-1");
    expect(detail.issues).toEqual([{ ticketId: issue.ticketId, displayId: issue.displayId, status: "open", createdAt: NOW.toISOString() }]);
  });
});

describe("admins resolving a reported issue", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.orders.save(order({ status: "in_progress", startedAt: new Date("2026-09-24T08:00:00Z") }));
    await h.report.execute("user-ada", "job-1", { issueType: "device_hardware", description: "x" }, NOW);
  });

  it("resumes where the issue stopped the job, keeping its stamps", async () => {
    const later = new Date("2026-09-24T12:00:00Z");
    expect(await h.changes.resolveIssue("platform", "job-1", "resume", "Spare unit sent", later)).toMatchObject({ status: "in_progress" });

    expect(await h.orders.findById("job-1")).toMatchObject({
      status: "in_progress", preExceptionStatus: null, startedAt: new Date("2026-09-24T08:00:00Z"), updatedAt: later,
    });
    expect(h.activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "system.installation.issue_resolved", metadata: expect.objectContaining({ outcome: "resume", note: "Spare unit sent" }) }),
    );
  });

  it("cancels the job", async () => {
    await h.changes.resolveIssue("platform", "job-1", "cancel", undefined, NOW);
    expect(await h.orders.findById("job-1")).toMatchObject({ status: "cancelled", cancelledAt: NOW, preExceptionStatus: null });
  });

  it("refuses callers without the permission while the issue is open", async () => {
    await expect(h.changes.resolveIssue("user-ada", "job-1", "cancel", undefined, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await h.orders.findById("job-1"))?.status).toBe("issue_reported");
  });

  it("refuses a job without a reported issue, and a missing job", async () => {
    await h.changes.resolveIssue("platform", "job-1", "resume", undefined, NOW);
    await expect(h.changes.resolveIssue("platform", "job-1", "cancel", undefined, NOW)).rejects.toBeInstanceOf(InstallationJobConflictError);
    await expect(h.changes.resolveIssue("platform", "nope", "cancel", undefined, NOW)).rejects.toBeInstanceOf(InstallationJobNotFoundError);
  });

  it("shows the latest report on the exception list", async () => {
    const list = await h.admin.list("platform", { status: "issue_reported" });
    const [ticket] = await h.tickets.findByRelatedOrders(["job-1"]);
    expect(list.items[0]).toMatchObject({ id: "job-1", status: "issue_reported", issueTicket: { id: ticket.id, displayId: "#tkt-1000" } });
  });
});

describe("admins rescheduling or editing a job", () => {
  let h: Harness;
  const TODAY = new Date("2026-09-24T10:00:00Z");
  beforeEach(async () => {
    h = await harness();
  });

  it("books an overdue job again when it gets a new date", async () => {
    await h.orders.save(order({ status: "overdue", installerNotes: "kept" }));
    const result = await h.changes.updateDetails("platform", "job-1", { scheduledDate: "2026-10-02", timeSlot: "afternoon" }, TODAY);

    expect(result.status).toBe("scheduled");
    expect(await h.orders.findById("job-1")).toMatchObject({
      status: "scheduled", scheduledDate: new Date("2026-10-02T00:00:00Z"), timeSlot: "afternoon", installerNotes: "kept",
    });
    expect(h.activity.record).toHaveBeenCalledWith(expect.objectContaining({ action: "system.installation.updated" }));
  });

  it("resumes an overdue job that was rescheduled while its issue was open as scheduled", async () => {
    await h.orders.save(order({ status: "overdue" }));
    await h.report.execute("user-ada", "job-1", { issueType: "job_scheduling", description: "Customer away" }, TODAY);
    await h.changes.updateDetails("platform", "job-1", { scheduledDate: "2026-10-02" }, TODAY);

    expect(await h.orders.findById("job-1")).toMatchObject({ status: "issue_reported", preExceptionStatus: "scheduled" });
    expect(await h.changes.resolveIssue("platform", "job-1", "resume", undefined, TODAY)).toMatchObject({ status: "scheduled" });
  });

  it("keeps a paused overdue job overdue when only the site changes", async () => {
    await h.orders.save(order({ status: "overdue" }));
    await h.report.execute("user-ada", "job-1", { issueType: "job_scheduling", description: "Customer away" }, TODAY);
    await h.changes.updateDetails("platform", "job-1", { city: "Yaba" }, TODAY);

    expect(await h.orders.findById("job-1")).toMatchObject({ status: "issue_reported", preExceptionStatus: "overdue" });
  });

  it("refuses callers without the permission", async () => {
    await expect(h.changes.updateDetails("user-ada", "job-1", { city: "Yaba" }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await h.orders.findById("job-1")).toEqual(order());
  });

  it("edits the site without moving the job", async () => {
    await h.orders.save(order({ status: "overdue" }));
    await h.changes.updateDetails("platform", "job-1", { addressLine: "2 Broad Street", siteContactPhone: "0701 445 2219" }, TODAY);

    expect(await h.orders.findById("job-1")).toMatchObject({ status: "overdue", addressLine: "2 Broad Street", siteContactPhone: "+2347014452219" });
  });

  it("refuses in progress, completed and cancelled jobs", async () => {
    await h.orders.save(order({ status: "in_progress" }));
    await expect(h.changes.updateDetails("platform", "job-1", { city: "Yaba" }, TODAY)).rejects.toBeInstanceOf(InstallationJobConflictError);
    for (const status of ["completed", "cancelled"] as const) {
      await h.orders.save(order({ status }));
      await expect(h.changes.updateDetails("platform", "job-1", { city: "Yaba" }, TODAY)).rejects.toBeInstanceOf(InstallationJobClosedError);
    }
  });

  it("applies the booking rules", async () => {
    await expect(h.changes.updateDetails("platform", "job-1", { scheduledDate: "2026-09-24" }, TODAY)).rejects.toBeInstanceOf(
      InvalidInstallationDateError,
    );
    await expect(h.changes.updateDetails("platform", "job-1", { scheduledDate: "2027-03-01" }, TODAY)).rejects.toBeInstanceOf(
      InvalidInstallationDateError,
    );
    await expect(h.changes.updateDetails("platform", "job-1", { timeSlot: "evening" }, TODAY)).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.changes.updateDetails("platform", "job-1", { siteContactPhone: "123" }, TODAY)).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.changes.updateDetails("platform", "job-1", {}, TODAY)).rejects.toBeInstanceOf(OnboardingValidationError);
    expect(await h.orders.findById("job-1")).toEqual(order());
  });

  it("refuses a change made from a stale read", async () => {
    vi.spyOn(h.orders, "saveDetails").mockResolvedValueOnce(false);
    await expect(h.changes.updateDetails("platform", "job-1", { city: "Yaba" }, TODAY)).rejects.toBeInstanceOf(InstallationJobConflictError);
  });
});

describe("the support desk's view of installer tickets", () => {
  it("filters to installer tickets and names the reporter and job", async () => {
    const h = await harness();
    await h.tickets.save(tenantTicket());
    const raised = await h.support.create("user-ada", { ...TICKET, relatedJobId: "job-1" }, NOW);
    const staff = { id: "admin", email: "a@co.com", role: "SUPER_ADMIN", tenantId: "system", accountStatus: "active" };
    const auth = [{ resolveAccessToken: () => ({ id: "admin" }) } as never, { findById: async () => staff } as never] as const;
    const context = new InstallerTicketContextService(h.installers, h.orders);
    const list = new ListSystemSupportTicketsUseCase(...auth, h.tickets, context);
    const get = new GetSystemSupportTicketUseCase(...auth, h.tickets, new InMemorySupportMessageRepository(), context);

    const desk = await list.execute("token", { reporterType: "installer" });
    expect(desk.data.tickets).toHaveLength(1);
    expect(desk.data.tickets[0]).toMatchObject({
      id: raised.id, displayId: "#tkt-1000", reporterName: "ada Installer", relatedJob: { id: "job-1", jobNumber: "FL-1000" },
    });
    const everything = await list.execute("token", {});
    expect(everything.data.tickets.find((t) => t.id === "tenant-ticket")).toMatchObject({ reporterName: null, relatedJob: null });
    expect((await get.execute("token", raised.id)).data).toMatchObject({ reporterName: "ada Installer", relatedJob: { jobNumber: "FL-1000" } });
  });
});
