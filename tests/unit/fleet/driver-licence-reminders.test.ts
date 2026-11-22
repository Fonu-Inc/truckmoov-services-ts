import { describe, expect, it } from "vitest";
import type {
  ArmedLicenceReminder,
  DriverLicenceReminder,
  DriverLicenceReminderRepository,
} from "../../../apps/fleet/src/driver-licence-reminders.repository";
import {
  DriverLicenceReminderInputError,
  DriverLicenceReminderNotFoundError,
  DriverLicenceRemindersService,
  isLicenceReminderDue,
} from "../../../apps/fleet/src/driver-licence-reminders.service";

const NOW = new Date("2026-11-22T10:00:00Z");

class InMemoryReminders implements DriverLicenceReminderRepository {
  rows = new Map<string, DriverLicenceReminder>();
  expiry = new Map<string, string>();
  async listByTenant(tenantId: string) {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId);
  }
  async save(r: DriverLicenceReminder) {
    this.rows.set(`${r.tenantId}:${r.driverId}`, { ...r });
  }
  async delete(tenantId: string, driverId: string) {
    this.rows.delete(`${tenantId}:${driverId}`);
  }
  async findArmed(): Promise<ArmedLicenceReminder[]> {
    return [...this.rows.values()]
      .filter((r) => this.expiry.has(r.driverId) && r.sentForExpiry !== this.expiry.get(r.driverId))
      .map((r) => ({ ...r, driverName: "Ada", licenseNumber: "LAG-1", licenseExpiryDate: this.expiry.get(r.driverId)! }));
  }
  async markSent(tenantId: string, driverId: string, expiry: string) {
    this.rows.get(`${tenantId}:${driverId}`)!.sentForExpiry = expiry;
  }
}

function setup() {
  const repo = new InMemoryReminders();
  const mails: string[] = [];
  const drivers = { findById: async (id: string, tenantId: string) => (tenantId === "t1" && id === "d1" ? { id } : null) } as never;
  const mailer = { send: async (m: { to: string }) => void mails.push(m.to) } as never;
  const config = { persistence: { backend: "memory" } } as never;
  return { repo, mails, service: new DriverLicenceRemindersService(repo, drivers, mailer, config) };
}

describe("Driver licence reminders", () => {
  it("is due once the expiry is within the lead time, or past", () => {
    expect(isLicenceReminderDue({ leadDays: 30, licenseExpiryDate: "2026-12-22" }, NOW)).toBe(true);
    expect(isLicenceReminderDue({ leadDays: 30, licenseExpiryDate: "2026-12-23" }, NOW)).toBe(false);
    expect(isLicenceReminderDue({ leadDays: 7, licenseExpiryDate: "2026-01-01T00:00:00.000Z" }, NOW)).toBe(true);
  });

  it("mails once per expiry date and again after the licence is renewed", async () => {
    const { repo, mails, service } = setup();
    await service.set("t1", "d1", " Ops@Company.com ", 30, NOW);
    repo.expiry.set("d1", "2026-12-01");

    expect(await service.sendDue(NOW)).toBe(1);
    expect(await service.sendDue(NOW)).toBe(0);
    expect(mails).toEqual(["ops@company.com"]);

    repo.expiry.set("d1", "2026-12-10");
    expect(await service.sendDue(NOW)).toBe(1);
  });

  it("refuses a bad email, an unsupported lead time and another tenant's driver", async () => {
    const { service } = setup();
    await expect(service.set("t1", "d1", "nope", 30)).rejects.toBeInstanceOf(DriverLicenceReminderInputError);
    await expect(service.set("t1", "d1", "a@b.co", 45)).rejects.toBeInstanceOf(DriverLicenceReminderInputError);
    await expect(service.set("t2", "d1", "a@b.co", 30)).rejects.toBeInstanceOf(DriverLicenceReminderNotFoundError);
  });
});
