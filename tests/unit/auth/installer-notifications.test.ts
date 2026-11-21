import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import {
  AdminJobChangesUseCases,
  DeviceVerificationListener,
  InMemoryInstallationOrderRepository,
  InMemoryInstallerNotificationRepository,
  InMemoryInstallerRepository,
  InstallerAssignmentService,
  InstallerNotificationNotFoundError,
  InstallerNotificationsUseCases,
  InstallerNotifier,
  NotifyDeviceVerificationUseCase,
  ScheduleInstallationUseCase,
  SweepInstallationOrdersUseCase,
  type StoredInstaller,
} from "@auth/installation";
import type { StoredInstallationOrder } from "@auth/installation/domain/installation-order.repository";
import type { InstallerNotificationType } from "@auth/installation/domain/installer-notification";
import type { InstallerNotice } from "@auth/installation/application/services/installer-notifier.service";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { installerTicket } from "@auth/installation/application/use-cases/support/installer-ticket";
import { UpdateInstallerNotificationPreferencesDto } from "../../../apps/auth/src/dto/installer-portal.dto";
import { InMemorySupportTicketRepository } from "../../../apps/auth/src/in-memory-support-ticket.repository";
import { InMemorySupportMessageRepository } from "../../../apps/auth/src/in-memory-support-message.repository";
import { UpdateSystemSupportTicketStatusUseCase } from "../../../apps/auth/src/update-system-support-ticket-status.use-case";
import { SendSystemSupportMessageUseCase } from "../../../apps/auth/src/send-system-support-message.use-case";
import { EscalateSystemSupportTicketUseCase } from "../../../apps/auth/src/escalate-system-support-ticket.use-case";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { AccessResolver } from "../../../apps/auth/src/access-resolver";
import { InMemoryTenantRoleRepository } from "../../../apps/auth/src/in-memory-tenant-role.repository";
import { InMemoryPermissionRemovalRepository } from "../../../apps/auth/src/in-memory-permission-removal.repository";

const NOW = new Date("2026-09-24T10:00:00Z");
const TENANT = "tenant-1";
const day = (date: string) => new Date(`${date}T00:00:00Z`);

function installer(id: string, overrides: Partial<StoredInstaller> = {}): StoredInstaller {
  return {
    id, userId: `user-${id}`, code: `INS-${id}`, firstName: id, lastName: "Installer", fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`, phoneNumber: "+2348031234567", team: "", state: "Lagos", city: "Ikeja", serviceAreas: ["Lagos"],
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, displayPreferences: null, workPreferences: null,
    status: "active", maxActiveJobs: 3,
    lastActivityAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function order(id: string, overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id, orderNumber: `FL-${id}`, applicationId: `app-${id}`, tenantId: TENANT, scheduledDate: day("2026-09-30"), timeSlot: "morning",
    addressLine: "14 Kudirat Abiola Way", city: "Ikeja", state: "Lagos", siteContactName: "Ada Obi", siteContactPhone: "+2347014452219",
    notes: null, installerNotes: null, installerId: "ada", status: "scheduled", preExceptionStatus: null, assignedAt: NOW,
    acceptedAt: NOW, startedAt: null, issueReportedAt: null, completedAt: null, cancelledAt: null, reminderSentAt: null,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

async function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const inbox = new InMemoryInstallerNotificationRepository(orders);
  const publisher = { notify: vi.fn(async () => {}) };
  const sms = { send: vi.fn(async () => ({ success: true, channel: "sms", message: "SMS accepted for delivery", reference: "sms-1" })) };
  const notifier = new InstallerNotifier(installers, inbox, publisher as never, sms as never);
  const tokens = { resolveAccessToken: (token: string) => ({ id: token, email: `${token}@co.com`, role: token === "platform" ? "PLATFORM_ADMIN" : "INSTALLER" }) };
  const notifications = new InstallerNotificationsUseCases(tokens as never, installers, inbox);

  const users = new InMemoryUserRepository();
  await users.save({ id: "platform", email: "p@co.com", passwordHash: "x", role: "PLATFORM_ADMIN", tenantId: "system" });
  const access = new AccessResolver(new InMemoryTenantRoleRepository(), new InMemoryPermissionRemovalRepository());
  const activity = { record: vi.fn(async () => ({})) };
  const changes = new AdminJobChangesUseCases(orders, tokens as never, users, access, activity as never, notifier);
  const assignment = new InstallerAssignmentService(installers, orders);
  const sweep = new SweepInstallationOrdersUseCase(orders, assignment, notifier);
  const verification = new NotifyDeviceVerificationUseCase(orders, notifier);

  await installers.save(installer("ada"));
  await installers.save(installer("bola"));
  return { installers, orders, inbox, publisher, sms, notifier, notifications, changes, assignment, sweep, verification };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function rows(h: Harness, installerId = "ada") {
  return (await h.inbox.list(installerId, { unreadOnly: false, page: 1, limit: 50 })).items;
}

function notice(type: InstallerNotificationType, overrides: Partial<InstallerNotice> = {}): InstallerNotice {
  return { type, order: order("1024"), stamp: "s1", ...overrides };
}

const TYPE_TOGGLES: Array<[InstallerNotificationType, string]> = [
  ["job_assigned", "newInstallationOffers"],
  ["job_reminder", "scheduleReminders"],
  ["job_updated", "jobAndIssueUpdates"],
  ["job_cancelled", "jobAndIssueUpdates"],
  ["issue_resolved", "jobAndIssueUpdates"],
  ["device_verified", "jobAndIssueUpdates"],
  ["device_verification_failed", "jobAndIssueUpdates"],
  ["support_ticket_updated", "supportTicketUpdates"],
];

function adaTicket() {
  return installerTicket({
    id: "tkt-1", ticketNumber: 1042, installer: installer("ada"), category: "configuration_setup", chip: null, priority: "medium",
    description: "Commands time out", callbackPhone: null, job: null, aboutJob: false, now: NOW,
  });
}

async function raise(h: Harness, type: InstallerNotificationType) {
  if (type === "support_ticket_updated") await h.notifier.notifyTicket(adaTicket(), { status: "resolved", at: NOW }, NOW);
  else await h.notifier.notify(notice(type), NOW);
}

const channelsSent = (h: Harness) => h.publisher.notify.mock.calls.map((call) => (call as unknown as [{ channel: string }])[0].channel);

describe("the notification preference matrix", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("writes the inbox row, emails and texts the installer when every toggle is at its default", async () => {
    await h.notifier.notify(notice("job_assigned"), NOW);

    expect(await rows(h)).toMatchObject([
      { type: "job_assigned", title: "New job assigned", body: "You have been assigned a new installation job (FL-1024).", orderId: "1024", jobNumber: null },
    ]);
    expect(h.publisher.notify.mock.calls).toEqual([[{
      tenantId: "system", notificationType: "job_assigned", channel: "email", recipient: "ada@fieldops.ng",
      content: "New job assigned\n\nYou have been assigned a new installation job (FL-1024).",
    }]]);
    expect(h.sms.send).toHaveBeenCalledWith({
      channel: "sms",
      to: "+2348031234567",
      message: "New job assigned. You have been assigned a new installation job (FL-1024).",
    });
  });

  const matrix = TYPE_TOGGLES.flatMap(([type, toggle]) =>
    [true, false].flatMap((typeOn) =>
      [[true, true], [true, false], [false, true], [false, false]].map(([inPlatformAlerts, emailAlerts]) => ({
        type, toggle, typeOn, inPlatformAlerts, emailAlerts,
      })),
    ),
  );
  it.each(matrix)(
    "$type with $toggle=$typeOn, inPlatformAlerts=$inPlatformAlerts, emailAlerts=$emailAlerts",
    async ({ type, toggle, typeOn, inPlatformAlerts, emailAlerts }) => {
      const preferences = { [toggle]: typeOn, inPlatformAlerts, emailAlerts };
      await h.installers.save(installer("ada", { notificationPreferences: preferences as never }));

      await raise(h, type);

      expect((await rows(h)).map((row) => row.type)).toEqual(typeOn && inPlatformAlerts ? [type] : []);
      expect(channelsSent(h)).toEqual(typeOn && emailAlerts ? ["email"] : []);
      expect(h.sms.send).toHaveBeenCalledTimes(type === "job_assigned" && typeOn && emailAlerts ? 1 : 0);
    },
  );

  it("a type toggle off silences only its own types", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { jobAndIssueUpdates: false } as never }));

    for (const [type] of TYPE_TOGGLES) await raise(h, type);

    expect((await rows(h)).map((row) => row.type).sort()).toEqual(["job_assigned", "job_reminder", "support_ticket_updated"]);
  });

  it("still has no smsAlerts preference; only job_assigned texts", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { smsAlerts: true } as never }));

    await h.notifier.notify(notice("job_updated"), NOW);

    expect(channelsSent(h)).toEqual(["email"]);
    expect(h.sms.send).not.toHaveBeenCalled();
    expect(await h.notifications.preferences("user-ada")).not.toHaveProperty("smsAlerts");
  });

  it("texts a job assignment even when the installer has no smsAlerts preference", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { emailAlerts: true } as never }));

    await h.notifier.notify(notice("job_assigned"), NOW);

    expect(h.sms.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the email and inbox when the assignment SMS fails", async () => {
    h.sms.send.mockRejectedValueOnce(new Error("dotgo down"));

    await expect(h.notifier.notify(notice("job_assigned"), NOW)).resolves.toBeUndefined();

    expect(await rows(h)).toHaveLength(1);
    expect(channelsSent(h)).toEqual(["email"]);
  });

  it("writes one row and emails once for the same notice twice", async () => {
    await h.notifier.notify(notice("job_updated"), NOW);
    await h.notifier.notify(notice("job_updated"), NOW);

    expect(await rows(h)).toHaveLength(1);
    expect(h.publisher.notify).toHaveBeenCalledTimes(1);
  });

  it("emails once for the same notice twice with inPlatformAlerts off, keeping the key in a hidden row", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { inPlatformAlerts: false } as never }));

    await h.notifier.notify(notice("job_updated"), NOW);
    await h.notifier.notify(notice("job_updated"), NOW);
    await h.notifier.notifyTicket(adaTicket(), { messageId: "m1" }, NOW);
    await h.notifier.notifyTicket(adaTicket(), { messageId: "m1" }, NOW);

    expect(channelsSent(h)).toEqual(["email", "email"]);
    expect(await rows(h)).toEqual([]);
    expect(await h.notifications.list("user-ada", {})).toMatchObject({ unreadCount: 0, total: 0, items: [] });
    expect(await h.notifications.markAllRead("user-ada")).toEqual({ updated: 0, unreadCount: 0 });
  });

  it("does not surface hidden rows once inPlatformAlerts is turned back on", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { inPlatformAlerts: false } as never }));
    await h.notifier.notify(notice("job_updated"), NOW);
    await h.installers.save(installer("ada"));

    await h.notifier.notify(notice("job_updated"), NOW);
    await h.notifier.notify(notice("job_cancelled"), NOW);

    expect((await rows(h)).map((row) => row.type)).toEqual(["job_cancelled"]);
    expect(channelsSent(h)).toEqual(["email", "email"]);
  });

  it("does nothing for a job without an installer", async () => {
    await h.notifier.notify(notice("job_updated", { order: order("1024", { installerId: null }) }), NOW);

    expect(await rows(h)).toEqual([]);
  });

  it("logs a failed write rather than throwing it", async () => {
    vi.spyOn(h.inbox, "add").mockRejectedValueOnce(new Error("db down"));

    await expect(h.notifier.notify(notice("job_updated"), NOW)).resolves.toBeUndefined();
    await expect(h.notifier.deliver(notice("job_updated"), NOW)).resolves.toBeUndefined();
    vi.spyOn(h.inbox, "add").mockRejectedValueOnce(new Error("db down"));
    await expect(h.notifier.deliver(notice("job_cancelled"), NOW)).rejects.toThrow("db down");
    vi.spyOn(h.inbox, "add").mockRejectedValueOnce(new Error("db down"));
    await expect(h.notifier.notifyTicket(adaTicket(), { status: "resolved", at: NOW }, NOW)).resolves.toBeUndefined();
  });
});

describe("the installer's inbox", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
    await h.orders.save(order("1024"));
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
    await h.notifier.notify(notice("job_assigned", { order: order("1024") }), at(1));
    await h.notifier.notify(notice("job_updated", { order: order("1024") }), at(2));
    await h.notifier.notify(notice("job_cancelled", { order: order("1024") }), at(3));
    await h.notifier.notify(notice("job_assigned", { order: order("2000", { installerId: "bola" }) }), at(4));
  });

  it("lists the caller's own notifications newest first, with the unread count and job number", async () => {
    const page = await h.notifications.list("user-ada", {});

    expect(page).toMatchObject({ unreadCount: 3, page: 1, limit: 20, total: 3 });
    expect(page.items.map((item) => item.type)).toEqual(["job_cancelled", "job_updated", "job_assigned"]);
    expect(page.items[0]).toEqual({
      id: expect.any(String), type: "job_cancelled", title: "Job cancelled", body: "Job #FL-1024 has been cancelled.",
      jobId: "1024", jobNumber: "FL-1024", createdAt: "2026-09-24T10:03:00.000Z", read: false,
    });
  });

  it("serves the dashboard preview with limit=3 and filters to unread", async () => {
    const [first] = (await h.notifications.list("user-ada", { limit: 3 })).items;
    await h.notifications.markRead("user-ada", first.id);

    expect((await h.notifications.list("user-ada", { limit: 3 })).items).toHaveLength(3);
    const unread = await h.notifications.list("user-ada", { unread: true });
    expect(unread).toMatchObject({ unreadCount: 2, total: 2 });
    expect(unread.items.every((item) => !item.read)).toBe(true);
  });

  it("marks one read, idempotently", async () => {
    const [first] = (await h.notifications.list("user-ada", {})).items;

    expect(await h.notifications.markRead("user-ada", first.id)).toEqual({ id: first.id, read: true, unreadCount: 2 });
    expect(await h.notifications.markRead("user-ada", first.id)).toEqual({ id: first.id, read: true, unreadCount: 2 });
  });

  it("answers another installer's notification as missing", async () => {
    const [bolas] = (await h.notifications.list("user-bola", {})).items;

    await expect(h.notifications.markRead("user-ada", bolas.id)).rejects.toBeInstanceOf(InstallerNotificationNotFoundError);
    await expect(h.notifications.markRead("user-ada", "nope")).rejects.toBeInstanceOf(InstallerNotificationNotFoundError);
    expect((await h.notifications.list("user-bola", {})).unreadCount).toBe(1);
  });

  it("marks all of the caller's notifications read and no one else's", async () => {
    expect(await h.notifications.markAllRead("user-ada")).toEqual({ updated: 3, unreadCount: 0 });

    expect((await h.notifications.list("user-ada", {})).items.every((item) => item.read)).toBe(true);
    expect((await h.notifications.list("user-bola", {})).unreadCount).toBe(1);
  });
});

describe("notification preferences", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("defaults every toggle to on", async () => {
    expect(await h.notifications.preferences("user-ada")).toEqual({
      newInstallationOffers: true, scheduleReminders: true, jobAndIssueUpdates: true,
      supportTicketUpdates: true, emailAlerts: true, inPlatformAlerts: true,
    });
  });

  it("changes only the toggles sent", async () => {
    await h.notifications.updatePreferences("user-ada", { inPlatformAlerts: false });
    const updated = await h.notifications.updatePreferences("user-ada", { scheduleReminders: false, supportTicketUpdates: false });

    expect(updated).toEqual({
      newInstallationOffers: true, scheduleReminders: false, jobAndIssueUpdates: true,
      supportTicketUpdates: false, emailAlerts: true, inPlatformAlerts: false,
    });
    expect((await h.installers.findById("ada"))?.notificationPreferences).toEqual(updated);
    expect(await h.notifications.preferences("user-bola")).toMatchObject({ inPlatformAlerts: true });
  });

  it("refuses a non-boolean or an empty change, and the retired toggles change nothing", async () => {
    await expect(h.notifications.updatePreferences("user-ada", { emailAlerts: "no" })).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.notifications.updatePreferences("user-ada", {})).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.notifications.updatePreferences("user-ada", { smsAlerts: false } as never)).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("refuses unknown and retired properties at the ValidationPipe", async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const check = (body: object) => pipe.transform(body, { type: "body", metatype: UpdateInstallerNotificationPreferencesDto });

    await expect(check({ inPlatformAlerts: false })).resolves.toMatchObject({ inPlatformAlerts: false });
    for (const retired of ["smsAlerts", "newJobAssigned", "jobStatusUpdates", "somethingElse"]) {
      await expect(check({ [retired]: true })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(check({ emailAlerts: "yes" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("support ticket updates", () => {
  let h: Harness;
  let tickets: InMemorySupportTicketRepository;
  let status: UpdateSystemSupportTicketStatusUseCase;
  let reply: SendSystemSupportMessageUseCase;
  let escalate: EscalateSystemSupportTicketUseCase;

  beforeEach(async () => {
    h = await harness();
    tickets = new InMemorySupportTicketRepository();
    const staff = { id: "staff-1", email: "staff@truckmoov.com", role: "SYSTEM_ADMIN", tenantId: "system", accountStatus: "active" };
    const tokens = { resolveAccessToken: () => ({ id: "staff-1", tenantId: "system", role: "SYSTEM_ADMIN" }) } as never;
    const users = { findById: async () => staff } as never;
    const desk = { notifyStatusChanged: vi.fn(async () => {}), notifyReplied: vi.fn(async () => {}) } as never;
    status = new UpdateSystemSupportTicketStatusUseCase(tokens, users, tickets, desk, h.notifier);
    reply = new SendSystemSupportMessageUseCase(tokens, users, tickets, new InMemorySupportMessageRepository(), desk, h.notifier);
    escalate = new EscalateSystemSupportTicketUseCase(tokens, users, tickets, desk, h.notifier);
    await tickets.save(adaTicket());
  });

  it("tells the installer who raised it that an admin changed its status", async () => {
    await status.execute("staff", "tkt-1", "in_progress");

    expect(await rows(h)).toMatchObject([
      { type: "support_ticket_updated", title: "Support ticket updated", body: "Your support ticket #tkt-1042 is now In Progress.", orderId: null },
    ]);
    expect(h.publisher.notify).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "support_ticket_updated", channel: "email" }));
  });

  it("tells them on escalation and on each reply, but not on an internal note", async () => {
    await escalate.execute("staff", "tkt-1", "vendor_installer");
    await reply.execute("staff", "tkt-1", "We are on it", false);
    await reply.execute("staff", "tkt-1", "Vendor is slow", true);
    await reply.execute("staff", "tkt-1", "Fixed on our side", false);

    expect((await rows(h)).map((row) => row.body).sort()).toEqual([
      "Support replied to your ticket #tkt-1042.",
      "Support replied to your ticket #tkt-1042.",
      "Your support ticket #tkt-1042 is now Escalated.",
    ]);
  });

  it("notifies each status change, a return to an earlier status included, but not the same status set again", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      await status.execute("staff", "tkt-1", "resolved");
      vi.setSystemTime(new Date(NOW.getTime() + 60_000));
      await status.execute("staff", "tkt-1", "resolved");
      await status.execute("staff", "tkt-1", "open");
      vi.setSystemTime(new Date(NOW.getTime() + 120_000));
      await status.execute("staff", "tkt-1", "resolved");
    } finally {
      vi.useRealTimers();
    }

    expect((await rows(h)).map((row) => row.body)).toEqual([
      "Your support ticket #tkt-1042 is now Resolved.",
      "Your support ticket #tkt-1042 is now Open.",
      "Your support ticket #tkt-1042 is now Resolved.",
    ]);
    expect(channelsSent(h)).toEqual(["email", "email", "email"]);
  });

  it("dedupes a repeated delivery of the same change", async () => {
    const change = { status: "resolved", at: NOW };

    await h.notifier.notifyTicket(adaTicket(), change, NOW);
    await h.notifier.notifyTicket(adaTicket(), { ...change }, NOW);

    expect(await rows(h)).toHaveLength(1);
    expect(channelsSent(h)).toEqual(["email"]);
  });

  it("says nothing about a tenant's ticket", async () => {
    await tickets.save({ ...adaTicket(), id: "tenant-ticket", tenantId: "tenant-1", reporterType: "tenant_user", reporterId: "user-1" });

    await status.execute("staff", "tenant-ticket", "resolved");
    await reply.execute("staff", "tenant-ticket", "Done", false);

    expect(await rows(h)).toEqual([]);
    expect(h.publisher.notify).not.toHaveBeenCalled();
  });

  it("stays silent with supportTicketUpdates off, and never fails the admin's change", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { supportTicketUpdates: false } as never }));
    await status.execute("staff", "tkt-1", "resolved");
    expect(await rows(h)).toEqual([]);

    vi.spyOn(h.installers, "findById").mockRejectedValueOnce(new Error("db down"));
    await expect(status.execute("staff", "tkt-1", "closed")).resolves.toMatchObject({ data: { status: "closed" } });
  });
});

describe("producers", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("tells the installer the booking assigned them", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const application = { id: "app-1", stage: "installation_scheduling", tenantId: TENANT };
    const applications = {
      findDeviceRequestsByApplicationId: async () => [{ quantity: 1 }],
      findVehiclesByApplicationId: async () => [{ id: "veh-1" }],
      save: vi.fn(async () => {}),
    };
    let id = 0;
    const booking = new ScheduleInstallationUseCase(
      applications as never, h.orders, h.assignment, { resolve: async () => application } as never,
      { execute: async () => ({ delivered: true }) } as never, { generate: () => `id-${id++}` }, h.notifier,
    );

    const booked = await booking.execute({
      applicationId: "app-1", applicationToken: "t", scheduledDate: soon, timeSlot: "morning", addressLine: "14 Kudirat Abiola Way",
      city: "Ikeja", state: "Lagos", siteContactName: "Ada Obi", siteContactPhone: "+2347014452219",
      assignments: [{ deviceIndex: 1, vehicleId: "veh-1" }],
    });

    expect(booked.data.status).toBe("assigned");
    const installerId = (await h.orders.findByApplicationId("app-1"))?.installerId;
    expect(await rows(h, installerId!)).toMatchObject([
      { type: "job_assigned", body: `You have been assigned a new installation job (${booked.data.orderNumber}).` },
    ]);
  });

  it("tells the installer the sweep assigned them", async () => {
    await h.orders.save(order("o1", { status: "unassigned", installerId: null, assignedAt: null, acceptedAt: null }));

    await h.sweep.run(NOW);

    const installerId = (await h.orders.findById("o1"))?.installerId;
    expect(await rows(h, installerId!)).toMatchObject([{ type: "job_assigned", body: "You have been assigned a new installation job (FL-o1)." }]);
  });

  it("tells the assigned installer the admin changed the job", async () => {
    await h.orders.save(order("o1"));

    await h.changes.updateDetails("platform", "o1", { city: "Yaba" }, NOW);

    expect(await rows(h)).toMatchObject([{ type: "job_updated", body: "Installation details for Job #FL-o1 have been updated." }]);
  });

  it("tells the installer an issue was resolved and the job resumed", async () => {
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "scheduled" }));

    await h.changes.resolveIssue("platform", "o1", "resume", undefined, NOW);

    expect(await rows(h)).toMatchObject([
      { type: "issue_resolved", title: "Issue resolved", body: "The issue on Job #FL-o1 has been resolved. The job has resumed." },
    ]);
  });

  it("tells the installer the job was cancelled when the issue is resolved by cancelling", async () => {
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "scheduled" }));

    await h.changes.resolveIssue("platform", "o1", "cancel", undefined, NOW);

    expect(await rows(h)).toMatchObject([{ type: "job_cancelled", body: "Job #FL-o1 has been cancelled." }]);
  });

  it("never fails or undoes the admin's change when notifying fails", async () => {
    vi.spyOn(h.inbox, "add").mockRejectedValue(new Error("db down"));
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "scheduled" }));
    await h.orders.save(order("o2", { status: "unassigned", installerId: null, assignedAt: null }));

    await expect(h.changes.resolveIssue("platform", "o1", "cancel", undefined, NOW)).resolves.toMatchObject({ status: "cancelled" });
    expect((await h.orders.findById("o1"))?.status).toBe("cancelled");
    expect((await h.sweep.run(NOW)).assigned).toBe(1);
  });
});

describe("the reminder sweep", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("reminds scheduled jobs booked for tomorrow in Lagos, never offers, with the date and slot", async () => {
    await h.orders.save(order("acc", { status: "scheduled", scheduledDate: day("2026-09-25") }));
    await h.orders.save(order("sch", { status: "scheduled", scheduledDate: day("2026-09-25"), timeSlot: "afternoon" }));
    await h.orders.save(order("asg", { status: "assigned", scheduledDate: day("2026-09-25") }));
    await h.orders.save(order("later", { status: "scheduled", scheduledDate: day("2026-09-26") }));

    expect((await h.sweep.run(NOW)).reminded).toBe(2);

    expect((await rows(h)).map((row) => row.body).sort()).toEqual([
      "Your installation for Job #FL-acc is tomorrow, 25 September (Morning).",
      "Your installation for Job #FL-sch is tomorrow, 25 September (Afternoon).",
    ]);
    expect((await h.orders.findById("acc"))?.reminderSentAt).toEqual(NOW);
    expect((await h.orders.findById("asg"))?.reminderSentAt ?? null).toBeNull();
  });

  it("follows the Lagos day, not the UTC one", async () => {
    await h.orders.save(order("o1", { scheduledDate: day("2026-09-26") }));

    expect((await h.sweep.run(new Date("2026-09-24T22:59:59Z"))).reminded).toBe(0);
    expect((await h.sweep.run(new Date("2026-09-24T23:00:00Z"))).reminded).toBe(1);
  });

  it("reminds once across runs", async () => {
    await h.orders.save(order("o1", { scheduledDate: day("2026-09-25") }));

    expect((await h.sweep.run(NOW)).reminded).toBe(1);
    expect((await h.sweep.run(new Date(NOW.getTime() + 600_000))).reminded).toBe(0);
    expect(await rows(h)).toHaveLength(1);
  });

  it("reminds again after a reschedule", async () => {
    await h.orders.save(order("o1", { scheduledDate: day("2026-09-25") }));
    await h.sweep.run(NOW);

    await h.changes.updateDetails("platform", "o1", { scheduledDate: "2026-09-27" }, NOW);
    expect((await h.orders.findById("o1"))?.reminderSentAt).toBeNull();
    await h.changes.updateDetails("platform", "o1", { city: "Yaba" }, NOW);
    expect((await h.orders.findById("o1"))?.reminderSentAt).toBeNull();

    expect((await h.sweep.run(new Date("2026-09-26T10:00:00Z"))).reminded).toBe(1);
    expect((await rows(h)).filter((row) => row.type === "job_reminder").map((row) => row.body)).toEqual([
      "Your installation for Job #FL-o1 is tomorrow, 27 September (Morning).",
      "Your installation for Job #FL-o1 is tomorrow, 25 September (Morning).",
    ]);
  });

  it("keeps the reminder stamp when the date does not change", async () => {
    await h.orders.save(order("o1", { scheduledDate: day("2026-09-25") }));
    await h.sweep.run(NOW);

    await h.changes.updateDetails("platform", "o1", { city: "Yaba" }, NOW);

    expect((await h.orders.findById("o1"))?.reminderSentAt).toEqual(NOW);
  });

  it("keeps a stamp claimed after the admin read the job", async () => {
    await h.orders.save(order("o1", { scheduledDate: day("2026-09-25") }));
    const beforeClaim = await h.orders.findById("o1");
    await h.sweep.run(NOW);
    vi.spyOn(h.orders, "findById").mockResolvedValueOnce(beforeClaim);

    await h.changes.updateDetails("platform", "o1", { city: "Yaba" }, NOW);

    expect((await h.orders.findById("o1"))?.reminderSentAt).toEqual(NOW);
    expect((await h.sweep.run(new Date(NOW.getTime() + 600_000))).reminded).toBe(0);
  });
});

describe("fleet verification events", () => {
  let h: Harness;
  let handlers: Array<(envelope: unknown) => Promise<void>>;
  let listener: DeviceVerificationListener;

  function envelope(outcome: "verified" | "failed", overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
    return {
      id: "evt-1", type: `device.verification.${outcome}`, version: 1, occurred_at: NOW.toISOString(), tenant_id: TENANT,
      data: { device_id: "dev-1", imei: "356307042441013", manufacturer: "Teltonika", model: "FMB920", ...data },
      ...overrides,
    };
  }

  beforeEach(async () => {
    h = await harness();
    handlers = [];
    const bus = { subscribe: vi.fn(async (_subject: string, handler: (envelope: unknown) => Promise<void>) => {
      handlers.push(handler);
      return async () => {};
    }) };
    listener = new DeviceVerificationListener(bus as never, h.verification);
    await listener.onApplicationBootstrap();
    expect(bus.subscribe).toHaveBeenCalledWith("tm.*.device.verification.>", expect.any(Function), "installer_notifications");

    await h.orders.save(order("o1", { status: "in_progress" }));
    await h.orders.replaceAssignments("o1", [
      { id: "u1", orderId: "o1", deviceIndex: 1, vehicleId: "veh-1", fleetDeviceId: "dev-1", createdAt: NOW },
    ]);
  });

  const emit = (event: unknown) => handlers[0](event);

  it("tells the job's installer the device is reporting", async () => {
    await emit(envelope("verified"));

    expect(await rows(h)).toMatchObject([
      { type: "device_verified", title: "Device verified", body: "Teltonika FMB920 (356307042441013) on Job #FL-o1 is now reporting.", orderId: "o1" },
    ]);
  });

  it("tells the job's installer why verification failed", async () => {
    await emit(envelope("failed", { id: "evt-2" }, { reason_code: "timeout", reason_message: "No telemetry arrived before the verification window closed" }));

    expect(await rows(h)).toMatchObject([
      {
        type: "device_verification_failed",
        body: "Teltonika FMB920 (356307042441013) on Job #FL-o1 failed verification: No telemetry arrived before the verification window closed.",
      },
    ]);
  });

  it("is idempotent on the event id", async () => {
    await emit(envelope("verified"));
    await emit(envelope("verified"));

    expect(await rows(h)).toHaveLength(1);
    expect(h.publisher.notify).toHaveBeenCalledTimes(1);
  });

  it("emails a redelivered event once with inPlatformAlerts off", async () => {
    await h.installers.save(installer("ada", { notificationPreferences: { inPlatformAlerts: false } as never }));

    await emit(envelope("verified"));
    await emit(envelope("verified"));

    expect(await rows(h)).toEqual([]);
    expect(h.publisher.notify).toHaveBeenCalledTimes(1);
  });

  it("ignores devices on no open job of the event's tenant", async () => {
    await emit(envelope("verified", { tenant_id: "tenant-2" }));
    await emit(envelope("verified", { id: "evt-3" }, { device_id: "unbound" }));
    await h.orders.save(order("o1", { status: "completed" }));
    await emit(envelope("verified", { id: "evt-4" }));
    await h.orders.save(order("o1", { status: "scheduled", installerId: null }));
    await emit(envelope("verified", { id: "evt-5" }));
    await emit({ ...envelope("verified", { id: "evt-6", type: "device.identity.changed" }) });

    expect(await rows(h)).toEqual([]);
  });

  it("fails the delivery so it is redelivered when the inbox cannot be written", async () => {
    vi.spyOn(h.inbox, "add").mockRejectedValueOnce(new Error("db down"));

    await expect(emit(envelope("verified"))).rejects.toThrow("db down");
    await emit(envelope("verified"));
    expect(await rows(h)).toHaveLength(1);
  });
});
