import { describe, expect, it, vi } from "vitest";
import { MaintenanceReminderService } from "../../../apps/fleet/src/maintenance-reminder.service";
import { InMemoryMaintenanceReminderScheduleRepository } from "../../../apps/fleet/src/in-memory-maintenance-reminder-schedule.repository";

const NOW = new Date("2026-10-15T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

describe("Maintenance reminder across replicas", () => {
  // Each replica's timer fires on its own clock; the tenant still gets one email per period.
  it("mails a tenant once per sweep period however many replicas sweep", async () => {
    const schedules = new InMemoryMaintenanceReminderScheduleRepository();
    await schedules.save({
      id: "sched-1", tenantId: "tenant-a", recipientEmail: "ops@acme.com", leadDays: 30, enabled: true,
      lastRunAt: null, lastSentCount: null, createdBy: "user-1", createdAt: NOW, updatedAt: NOW,
    });
    const records = {
      findAllByTenant: async () => [
        { vehicleId: "LAG-1", maintenanceType: "service", status: "scheduled", priority: "high", scheduledDate: NOW.toISOString() },
      ],
    };
    const mailer = { send: vi.fn(async () => {}) };
    const config = { fleet: { maintenanceReminderSweepHours: 24 }, persistence: { backend: "in-memory" } };
    const replica = () => new MaintenanceReminderService(schedules, records as never, mailer as never, config as never);

    await replica().sweep(NOW);
    await replica().sweep(new Date(NOW.getTime() + 7 * HOUR_MS));
    expect(mailer.send).toHaveBeenCalledTimes(1);

    await replica().sweep(new Date(NOW.getTime() + 24 * HOUR_MS));
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });
});
