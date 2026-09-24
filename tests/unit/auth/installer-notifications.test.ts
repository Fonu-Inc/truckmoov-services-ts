import { beforeEach, describe, expect, it, vi } from "vitest";
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
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, status: "active", maxActiveJobs: 3,
    lastActivityAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function order(id: string, overrides: Partial<StoredInstallationOrder> = {}): StoredInstallationOrder {
  return {
    id, orderNumber: `FL-${id}`, applicationId: `app-${id}`, tenantId: TENANT, scheduledDate: day("2026-09-30"), timeSlot: "morning",
    addressLine: "14 Kudirat Abiola Way", city: "Ikeja", state: "Lagos", siteContactName: "Ada Obi", siteContactPhone: "+2347014452219",
    notes: null, installerNotes: null, installerId: "ada", status: "accepted", preExceptionStatus: null, assignedAt: NOW,
    acceptedAt: NOW, startedAt: null, issueReportedAt: null, completedAt: null, cancelledAt: null, reminderSentAt: null,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

async function harness() {
  const installers = new InMemoryInstallerRepository();
  const orders = new InMemoryInstallationOrderRepository();
  const inbox = new InMemoryInstallerNotificationRepository(orders);
  const publisher = { notify: vi.fn(async () => {}) };
  const notifier = new InstallerNotifier(installers, inbox, publisher as never);
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
  return { installers, orders, inbox, publisher, notifier, notifications, changes, assignment, sweep, verification };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function rows(h: Harness, installerId = "ada") {
  return (await h.inbox.list(installerId, { unreadOnly: false, page: 1, limit: 50 })).items;
}

function notice(type: InstallerNotificationType, overrides: Partial<InstallerNotice> = {}): InstallerNotice {
  return { type, order: order("1024"), stamp: "s1", ...overrides };
}

describe("the notification preference matrix", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it("writes the inbox row and sends SMS and email under the system tenant when every toggle is at its default", async () => {
    await h.notifier.notify(notice("job_assigned"), NOW);

    expect(await rows(h)).toMatchObject([
      { type: "job_assigned", title: "New job assigned", body: "You have been assigned a new installation job (FL-1024).", orderId: "1024", jobNumber: null },
    ]);
    expect(h.publisher.notify).toHaveBeenCalledWith({
      tenantId: "system", notificationType: "job_assigned", channel: "sms", recipient: "+2348031234567",
      content: "You have been assigned a new installation job (FL-1024).",
    });
    expect(h.publisher.notify).toHaveBeenCalledWith({
      tenantId: "system", notificationType: "job_assigned", channel: "email", recipient: "ada@fieldops.ng",
      content: "New job assigned\n\nYou have been assigned a new installation job (FL-1024).",
    });
  });

  const typeToggles: Array<[string, InstallerNotificationType, InstallerNotificationType]> = [
    ["newJobAssigned", "job_assigned", "job_updated"],
    ["scheduleReminders", "job_reminder", "job_assigned"],
    ["jobStatusUpdates", "job_cancelled", "job_reminder"],
    ["jobStatusUpdates", "device_verified", "job_assigned"],
  ];
  for (const [toggle, silenced, unaffected] of typeToggles) {
    it(`${toggle} off silences ${silenced} entirely but not ${unaffected}`, async () => {
      await h.installers.save(installer("ada", { notificationPreferences: { [toggle]: false } as never }));

      await h.notifier.notify(notice(silenced), NOW);
      expect(await rows(h)).toEqual([]);
      expect(h.publisher.notify).not.toHaveBeenCalled();

      await h.notifier.notify(notice(unaffected), NOW);
      expect((await rows(h)).map((row) => row.type)).toEqual([unaffected]);
    });
  }

  const channels: Array<[Record<string, boolean>, string[]]> = [
    [{ smsAlerts: false }, ["email"]],
    [{ emailAlerts: false }, ["sms"]],
    [{ smsAlerts: false, emailAlerts: false }, []],
  ];
  for (const [preferences, sent] of channels) {
    it(`keeps the inbox row and sends only ${sent.join(" and ") || "nothing"} with ${JSON.stringify(preferences)}`, async () => {
      await h.installers.save(installer("ada", { notificationPreferences: preferences as never }));

      await h.notifier.notify(notice("job_updated"), NOW);

      expect(await rows(h)).toHaveLength(1);
      expect(h.publisher.notify.mock.calls.map((call) => (call as unknown as [{ channel: string }])[0].channel)).toEqual(sent);
    });
  }

  it("writes one row and sends once for the same notice twice", async () => {
    await h.notifier.notify(notice("job_updated"), NOW);
    await h.notifier.notify(notice("job_updated"), NOW);

    expect(await rows(h)).toHaveLength(1);
    expect(h.publisher.notify).toHaveBeenCalledTimes(2);
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
      newJobAssigned: true, scheduleReminders: true, jobStatusUpdates: true, smsAlerts: true, emailAlerts: true,
    });
  });

  it("changes only the toggles sent", async () => {
    await h.notifications.updatePreferences("user-ada", { smsAlerts: false });
    const updated = await h.notifications.updatePreferences("user-ada", { scheduleReminders: false });

    expect(updated).toEqual({ newJobAssigned: true, scheduleReminders: false, jobStatusUpdates: true, smsAlerts: false, emailAlerts: true });
    expect((await h.installers.findById("ada"))?.notificationPreferences).toEqual(updated);
    expect(await h.notifications.preferences("user-bola")).toMatchObject({ smsAlerts: true });
  });

  it("refuses a non-boolean or an empty change", async () => {
    await expect(h.notifications.updatePreferences("user-ada", { smsAlerts: "no" })).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(h.notifications.updatePreferences("user-ada", {})).rejects.toBeInstanceOf(OnboardingValidationError);
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
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "accepted" }));

    await h.changes.resolveIssue("platform", "o1", "resume", undefined, NOW);

    expect(await rows(h)).toMatchObject([
      { type: "issue_resolved", title: "Issue resolved", body: "The issue on Job #FL-o1 has been resolved. The job has resumed." },
    ]);
  });

  it("tells the installer the job was cancelled when the issue is resolved by cancelling", async () => {
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "accepted" }));

    await h.changes.resolveIssue("platform", "o1", "cancel", undefined, NOW);

    expect(await rows(h)).toMatchObject([{ type: "job_cancelled", body: "Job #FL-o1 has been cancelled." }]);
  });

  it("never fails or undoes the admin's change when notifying fails", async () => {
    vi.spyOn(h.inbox, "add").mockRejectedValue(new Error("db down"));
    await h.orders.save(order("o1", { status: "issue_reported", preExceptionStatus: "accepted" }));
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

  it("reminds accepted and scheduled jobs booked for tomorrow in Lagos, with the date and slot", async () => {
    await h.orders.save(order("acc", { status: "accepted", scheduledDate: day("2026-09-25") }));
    await h.orders.save(order("sch", { status: "scheduled", scheduledDate: day("2026-09-25"), timeSlot: "afternoon" }));
    await h.orders.save(order("asg", { status: "assigned", scheduledDate: day("2026-09-25") }));
    await h.orders.save(order("later", { status: "accepted", scheduledDate: day("2026-09-26") }));

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
    expect(h.publisher.notify).toHaveBeenCalledTimes(2);
  });

  it("ignores devices on no open job of the event's tenant", async () => {
    await emit(envelope("verified", { tenant_id: "tenant-2" }));
    await emit(envelope("verified", { id: "evt-3" }, { device_id: "unbound" }));
    await h.orders.save(order("o1", { status: "completed" }));
    await emit(envelope("verified", { id: "evt-4" }));
    await h.orders.save(order("o1", { status: "accepted", installerId: null }));
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
