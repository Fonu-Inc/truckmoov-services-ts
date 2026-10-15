import { describe, expect, it, vi } from "vitest";
import { MaintenanceReminderService } from "../../../apps/fleet/src/maintenance-reminder.service";
import type { MaintenanceReminderSchedule } from "../../../apps/fleet/src/contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";
import { InMemoryMaintenanceReminderScheduleRepository } from "../../../apps/fleet/src/in-memory-maintenance-reminder-schedule.repository";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    tenantId: "tenant-a",
    vehicleId: "LAG-234-XY",
    maintenanceType: "preventive",
    description: null,
    status: "scheduled",
    priority: "medium",
    scheduledDate: daysFromNow(10),
    completedDate: null,
    cost: null,
    currency: "NGN",
    technician: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function schedule(overrides: Partial<MaintenanceReminderSchedule> = {}): MaintenanceReminderSchedule {
  return {
    id: "sched-1",
    tenantId: "tenant-a",
    recipientEmail: "manager@company.com",
    leadDays: 30,
    enabled: true,
    lastRunAt: null,
    lastSentCount: null,
    createdBy: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildService(records: Record<string, unknown[]>) {
  const schedules = new InMemoryMaintenanceReminderScheduleRepository();
  const sent: Array<{ to: string; subject: string; variables?: Record<string, string> }> = [];
  const mailer = {
    send: vi.fn(async (input: { to: string; subject: string; variables?: Record<string, string> }) => {
      sent.push(input);
    }),
  };
  const recordRepo = {
    findAllByTenant: vi.fn(async (tenantId: string) => records[tenantId] ?? []),
  };
  const config = { fleet: { maintenanceReminderSweepHours: 24 }, persistence: { backend: "in-memory" } };

  const service = new MaintenanceReminderService(
    schedules,
    recordRepo as never,
    mailer as never,
    config as never,
  );
  return { service, schedules, sent, mailer };
}

describe("Maintenance reminder sweep", () => {
  it("includes work due inside the window and anything already overdue", async () => {
    const { service } = buildService({
      "tenant-a": [
        record({ id: "due-soon", scheduledDate: daysFromNow(10) }),
        record({ id: "overdue", scheduledDate: daysFromNow(-5) }),
        record({ id: "far-off", scheduledDate: daysFromNow(60) }),
      ],
    });

    const due = await service.findDue(schedule(), NOW);

    expect(due.map((entry) => entry.daysUntilDue)).toEqual([-5, 10]);
  });

  it("ignores completed and cancelled work", async () => {
    const { service } = buildService({
      "tenant-a": [
        record({ id: "done", status: "completed", scheduledDate: daysFromNow(2) }),
        record({ id: "dropped", status: "cancelled", scheduledDate: daysFromNow(2) }),
        record({ id: "live", status: "in_progress", scheduledDate: daysFromNow(2) }),
      ],
    });

    const due = await service.findDue(schedule(), NOW);
    expect(due).toHaveLength(1);
    expect(due[0].status).toBe("in_progress");
  });

  it("respects a shorter lead window", async () => {
    const { service } = buildService({
      "tenant-a": [record({ scheduledDate: daysFromNow(20) })],
    });

    expect(await service.findDue(schedule({ leadDays: 7 }), NOW)).toHaveLength(0);
    expect(await service.findDue(schedule({ leadDays: 30 }), NOW)).toHaveLength(1);
  });

  it("sends one email to the configured recipient and records the run", async () => {
    const { service, schedules, sent } = buildService({
      "tenant-a": [record({ scheduledDate: daysFromNow(3) })],
    });
    await schedules.save(schedule());

    await service.runForTenant(schedule(), NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("manager@company.com");
    expect(sent[0].subject).toMatch(/1 vehicle\(s\)/);

    const stored = await schedules.findByTenantId("tenant-a");
    expect(stored?.lastSentCount).toBe(1);
    expect(stored?.lastRunAt).toEqual(NOW);
  });

  it("sends nothing when there is nothing due, but still records the run", async () => {
    const { service, schedules, sent } = buildService({ "tenant-a": [] });
    await schedules.save(schedule());

    await service.runForTenant(schedule(), NOW);

    expect(sent).toHaveLength(0);
    const stored = await schedules.findByTenantId("tenant-a");
    expect(stored?.lastSentCount).toBe(0);
  });

  // One tenant's vehicles must never reach another tenant's inbox.
  it("keeps tenants separate across a sweep", async () => {
    const { service, schedules, sent } = buildService({
      "tenant-a": [record({ vehicleId: "LAG-A", scheduledDate: daysFromNow(1) })],
      "tenant-b": [record({ tenantId: "tenant-b", vehicleId: "LAG-B", scheduledDate: daysFromNow(1) })],
    });
    await schedules.save(schedule());
    await schedules.save(schedule({ id: "sched-2", tenantId: "tenant-b", recipientEmail: "b@company.com" }));

    await service.sweep(NOW);

    expect(sent).toHaveLength(2);
    const toA = sent.find((email) => email.to === "manager@company.com");
    const toB = sent.find((email) => email.to === "b@company.com");
    expect(toA?.variables?.rows).toContain("LAG-A");
    expect(toA?.variables?.rows).not.toContain("LAG-B");
    expect(toB?.variables?.rows).toContain("LAG-B");
    expect(toB?.variables?.rows).not.toContain("LAG-A");
  });

  it("skips disabled schedules", async () => {
    const { service, schedules, sent } = buildService({
      "tenant-a": [record({ scheduledDate: daysFromNow(1) })],
    });
    await schedules.save(schedule({ enabled: false }));

    await service.sweep(NOW);
    expect(sent).toHaveLength(0);
  });
});
