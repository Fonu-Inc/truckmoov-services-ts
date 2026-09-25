import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, UnauthorizedException, ValidationPipe, type Type } from "@nestjs/common";
import {
  ChangeInstallerPasswordUseCase,
  InMemoryInstallerRepository,
  InstallerPreferencesUseCases,
  type StoredInstaller,
} from "@auth/installation";
import { ChangeSystemPasswordUseCase, ForbiddenError, InvalidCredentialsError } from "@auth/session";
import { OnboardingValidationError } from "@auth/onboarding/domain/onboarding-application.validation";
import { InMemoryUserRepository } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository";
import { InMemorySessionStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-session.store";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { mapped } from "../../../apps/auth/src/installation-http";
import {
  UpdateInstallerDisplayPreferencesDto,
  UpdateInstallerWorkPreferencesDto,
} from "../../../apps/auth/src/dto/installer-portal.dto";
import { Migration20260925160000 } from "../../../apps/auth/src/migrations/Migration20260925160000";
import { Migration20260925170000 } from "../../../apps/auth/src/migrations/Migration20260925170000";

const NOW = new Date("2026-09-25T10:00:00Z");

function installer(id: string, overrides: Partial<StoredInstaller> = {}): StoredInstaller {
  return {
    id, userId: `user-${id}`, code: `INS-${id}`, firstName: id, lastName: "Installer", fullName: `${id} Installer`,
    email: `${id}@fieldops.ng`, phoneNumber: "+2348031234567", team: "", state: "Lagos", city: "Ikeja", serviceAreas: ["Lagos", "Ogun"],
    capabilities: ["device_installation"], photoKey: null, notificationPreferences: null, displayPreferences: null, workPreferences: null,
    status: "active", maxActiveJobs: 3, lastActivityAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

const tokens = { resolveAccessToken: (token: string) => ({ id: token }) };

function validated<T extends object>(metatype: Type<T>, body: object) {
  return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }).transform(body, { type: "body", metatype });
}

describe("display preferences", () => {
  let installers: InMemoryInstallerRepository;
  let preferences: InstallerPreferencesUseCases;

  beforeEach(async () => {
    installers = new InMemoryInstallerRepository();
    preferences = new InstallerPreferencesUseCases(tokens as never, installers);
    await installers.save(installer("ada"));
    await installers.save(installer("bola"));
  });

  it("defaults to Africa/Lagos and the last 7 days", async () => {
    expect(await preferences.display("user-ada")).toEqual({ timezone: "Africa/Lagos", defaultTimeRange: "last_7_days" });
  });

  it("changes only what is sent, stores it on the installer, and leaves others alone", async () => {
    await preferences.updateDisplay("user-ada", { timezone: "Europe/London" });
    const updated = await preferences.updateDisplay("user-ada", { defaultTimeRange: "last_90_days" });

    expect(updated).toEqual({ timezone: "Europe/London", defaultTimeRange: "last_90_days" });
    expect((await installers.findById("ada"))?.displayPreferences).toEqual(updated);
    expect(await preferences.display("user-bola")).toEqual({ timezone: "Africa/Lagos", defaultTimeRange: "last_7_days" });
  });

  it("stores the runtime's spelling of the zone", async () => {
    expect(await preferences.updateDisplay("user-ada", { timezone: " africa/lagos " })).toMatchObject({ timezone: "Africa/Lagos" });
  });

  it.each([["Mars/Olympus"], ["+01:00"], ["GMT+1 West Africa"], [""], [42]])("refuses the time zone %j", async (timezone) => {
    await expect(preferences.updateDisplay("user-ada", { timezone })).rejects.toThrow(
      "timezone must be an IANA time zone, such as Africa/Lagos",
    );
  });

  it.each([["today"], ["last_7_days"], ["last_30_days"], ["last_90_days"]])("takes the range %s", async (defaultTimeRange) => {
    expect(await preferences.updateDisplay("user-ada", { defaultTimeRange })).toMatchObject({ defaultTimeRange });
  });

  it("refuses an unknown range and an empty change", async () => {
    await expect(preferences.updateDisplay("user-ada", { defaultTimeRange: "last_year" })).rejects.toThrow(
      "defaultTimeRange must be one of: today, last_7_days, last_30_days, last_90_days",
    );
    await expect(preferences.updateDisplay("user-ada", {})).rejects.toBeInstanceOf(OnboardingValidationError);
  });

  it("refuses unknown properties at the ValidationPipe", async () => {
    await expect(validated(UpdateInstallerDisplayPreferencesDto, { timezone: "Africa/Lagos" })).resolves.toBeTruthy();
    await expect(validated(UpdateInstallerDisplayPreferencesDto, { sessionTimeout: "1h" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validated(UpdateInstallerDisplayPreferencesDto, { defaultTimeRange: "forever" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("is closed to a suspended installer", async () => {
    await installers.save(installer("ada", { status: "suspended" }));

    await expect(preferences.display("user-ada")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(preferences.updateDisplay("user-ada", { timezone: "Europe/London" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("work preferences", () => {
  let installers: InMemoryInstallerRepository;
  let preferences: InstallerPreferencesUseCases;

  beforeEach(async () => {
    installers = new InMemoryInstallerRepository();
    preferences = new InstallerPreferencesUseCases(tokens as never, installers);
    await installers.save(installer("ada"));
  });

  it("defaults to available, 08:00–18:00 on all days, with the admin's service areas", async () => {
    expect(await preferences.work("user-ada")).toEqual({
      availability: "available",
      workingHours: { start: "08:00", end: "18:00" },
      preferredPeriods: "all_days",
      serviceAreas: ["Lagos", "Ogun"],
    });
  });

  it("changes only what is sent and stores it on the installer", async () => {
    await preferences.updateWork("user-ada", { availability: "unavailable" });
    const updated = await preferences.updateWork("user-ada", { workingHours: { start: "07:30", end: "16:00" }, preferredPeriods: "weekdays" });

    expect(updated).toEqual({
      availability: "unavailable",
      workingHours: { start: "07:30", end: "16:00" },
      preferredPeriods: "weekdays",
      serviceAreas: ["Lagos", "Ogun"],
    });
    expect((await installers.findById("ada"))?.workPreferences).toEqual({
      availability: "unavailable", workingHours: { start: "07:30", end: "16:00" }, preferredPeriods: "weekdays",
    });
  });

  it.each([
    [{ availability: "busy" }, "availability must be one of: available, unavailable"],
    [{ preferredPeriods: "nights" }, "preferredPeriods must be one of: weekdays, weekends, all_days"],
    [{ workingHours: "08:00 - 18:00" }, "workingHours must be an object with start and end"],
    [{ workingHours: { start: "8:00", end: "18:00" } }, "workingHours.start must be a 24-hour time (HH:MM)"],
    [{ workingHours: { start: "08:00", end: "24:00" } }, "workingHours.end must be a 24-hour time (HH:MM)"],
    [{ workingHours: { start: "08:00" } }, "workingHours.end must be a 24-hour time (HH:MM)"],
    [{ workingHours: { start: "18:00", end: "08:00" } }, "workingHours.start must be before workingHours.end"],
    [{ workingHours: { start: "09:00", end: "09:00" } }, "workingHours.start must be before workingHours.end"],
    [{}, "Nothing to change"],
  ])("refuses %j", async (change, message) => {
    await expect(preferences.updateWork("user-ada", change)).rejects.toThrow(message);
    expect((await installers.findById("ada"))?.workPreferences).toBeNull();
  });

  it("never lets the installer set service areas or capabilities", async () => {
    await expect(validated(UpdateInstallerWorkPreferencesDto, { serviceAreas: ["Kano"] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validated(UpdateInstallerWorkPreferencesDto, { capabilities: ["sim_activation"] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(preferences.updateWork("user-ada", { serviceAreas: ["Kano"] } as never)).rejects.toThrow("Nothing to change");
    expect((await installers.findById("ada"))?.serviceAreas).toEqual(["Lagos", "Ogun"]);
  });

  it("refuses unknown properties, nested ones included, at the ValidationPipe", async () => {
    const ok = { availability: "available", workingHours: { start: "08:00", end: "18:00" }, preferredPeriods: "weekends" };

    await expect(validated(UpdateInstallerWorkPreferencesDto, ok)).resolves.toMatchObject({ workingHours: { start: "08:00" } });
    await expect(validated(UpdateInstallerWorkPreferencesDto, { workingHours: { start: "08:00", end: "18:00", lunch: "13:00" } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validated(UpdateInstallerWorkPreferencesDto, { workingHours: "08:00-18:00" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validated(UpdateInstallerWorkPreferencesDto, { availability: "busy" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("changing the installer's password", () => {
  let installers: InMemoryInstallerRepository;
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionStore;
  let activity: { record: ReturnType<typeof vi.fn> };
  let change: ChangeInstallerPasswordUseCase;
  let system: ChangeSystemPasswordUseCase;

  beforeEach(async () => {
    installers = new InMemoryInstallerRepository();
    users = new InMemoryUserRepository();
    sessions = new InMemorySessionStore();
    activity = { record: vi.fn(async () => ({})) };
    const hasher = { hash: async (p: string) => `hashed:${p}`, verify: async (p: string, hash: string) => hash === `hashed:${p}` };
    let issued = 0;
    const sessionTokens = {
      ...tokens,
      issueAccessToken: (u: AuthUser) => `access:${u.id}:${++issued}`,
      issueRefreshToken: (u: AuthUser) => `refresh:${u.id}:${++issued}`,
    };
    system = new ChangeSystemPasswordUseCase(sessionTokens as never, users, sessions, hasher as never);
    change = new ChangeInstallerPasswordUseCase(sessionTokens as never, installers, system, activity as never);

    await installers.save(installer("ada"));
    await users.save({ id: "user-ada", email: "ada@fieldops.ng", passwordHash: "hashed:OldPass123!", role: "INSTALLER", tenantId: "system" });
    await users.save({ id: "user-staff", email: "staff@truckmoov.com", passwordHash: "hashed:OldPass123!", role: "SYSTEM_ADMIN", tenantId: "system" });
    await sessions.save("refresh:old", AuthUser.create({ id: "user-ada", email: "ada@fieldops.ng", role: "INSTALLER", tenantId: "system" }));
  });

  it("sets the new password, ends every session, returns a new pair and audits it", async () => {
    const session = await change.execute("user-ada", { currentPassword: "OldPass123!", newPassword: "NewPass456!" });

    expect(session).toMatchObject({ accessToken: expect.stringMatching(/^access:user-ada/), refreshToken: expect.any(String), expiresIn: 3600 });
    expect(session.user).toEqual({ id: "user-ada", email: "ada@fieldops.ng", role: "INSTALLER", tenantId: "system" });
    expect((await users.findById("user-ada"))?.passwordHash).toBe("hashed:NewPass456!");
    expect(await sessions.getByRefreshToken("refresh:old")).toBeNull();
    expect(await sessions.getByRefreshToken(session.refreshToken)).not.toBeNull();
    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "system", action: "installer.password.changed", entityType: "user", entityId: "user-ada", actorRole: "INSTALLER",
    }));
  });

  it("answers a wrong current password as the system route does, changing nothing", async () => {
    const attempt = change.execute("user-ada", { currentPassword: "Wrong123!", newPassword: "NewPass456!" });

    await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
    const answer = await mapped(() => change.execute("user-ada", { currentPassword: "Wrong123!", newPassword: "NewPass456!" })).catch((e) => e);
    expect(answer).toBeInstanceOf(UnauthorizedException);
    expect((answer as UnauthorizedException).getResponse()).toEqual({ statusCode: 401, message: "Invalid credentials", error: "Unauthorized" });
    expect((await users.findById("user-ada"))?.passwordHash).toBe("hashed:OldPass123!");
    expect(await sessions.getByRefreshToken("refresh:old")).not.toBeNull();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("still answers when the audit fails: the password has changed", async () => {
    activity.record.mockRejectedValueOnce(new Error("db down"));

    await expect(change.execute("user-ada", { currentPassword: "OldPass123!", newPassword: "NewPass456!" })).resolves.toBeTruthy();
  });

  it("is closed to a suspended installer and to staff, and the system route stays closed to installers", async () => {
    await installers.save(installer("ada", { status: "suspended" }));
    await expect(change.execute("user-ada", { currentPassword: "OldPass123!", newPassword: "NewPass456!" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(change.execute("user-staff", { currentPassword: "OldPass123!", newPassword: "NewPass456!" })).rejects.toBeInstanceOf(ForbiddenError);

    await installers.save(installer("ada"));
    await expect(system.execute({ accessToken: "user-ada", currentPassword: "OldPass123!", newPassword: "NewPass456!" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(system.execute({ accessToken: "user-staff", currentPassword: "OldPass123!", newPassword: "NewPass456!" })).resolves.toBeTruthy();
  });
});

describe("the settings migration", () => {
  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20260925160000.prototype) as Migration20260925160000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("adds the preference columns and maps the stored toggles to the new names, dropping smsAlerts", () => {
    const up = sql("up");

    expect(up).toMatch(/add column if not exists "display_preferences" jsonb null/);
    expect(up).toMatch(/add column if not exists "work_preferences" jsonb null/);
    expect(up).toMatch(/'newInstallationOffers', "notification_preferences"->'newJobAssigned'/);
    expect(up).toMatch(/'scheduleReminders', "notification_preferences"->'scheduleReminders'/);
    expect(up).toMatch(/'jobAndIssueUpdates', "notification_preferences"->'jobStatusUpdates'/);
    expect(up).toMatch(/'emailAlerts', "notification_preferences"->'emailAlerts'/);
    expect(up).toMatch(/'supportTicketUpdates', true/);
    expect(up).toMatch(/'inPlatformAlerts', true/);
    expect(up).not.toMatch(/smsAlerts/);
    expect(up).toMatch(/jsonb_strip_nulls/);
  });

  it("maps back on the way down, smsAlerts on, and drops the columns", () => {
    const down = sql("down");

    expect(down).toMatch(/'newJobAssigned', "notification_preferences"->'newInstallationOffers'/);
    expect(down).toMatch(/'jobStatusUpdates', "notification_preferences"->'jobAndIssueUpdates'/);
    expect(down).toMatch(/'smsAlerts', true/);
    expect(down).not.toMatch(/supportTicketUpdates|inPlatformAlerts/);
    expect(down).toMatch(/drop column if exists "work_preferences"/);
    expect(down).toMatch(/drop column if exists "display_preferences"/);
  });
});

describe("the hidden notification migration", () => {
  function sql(direction: "up" | "down"): string {
    const statements: string[] = [];
    const migration = Object.create(Migration20260925170000.prototype) as Migration20260925170000;
    Object.assign(migration, { addSql: (statement: string) => statements.push(statement) });
    void migration[direction]();
    return statements.join("\n");
  }

  it("adds the hidden flag, off for every existing row", () => {
    expect(sql("up")).toMatch(/add column if not exists "hidden" boolean not null default false/);
  });

  it("drops hidden rows before the flag on the way down, so none surface", () => {
    expect(sql("down")).toMatch(/delete from "installer_notifications" where "hidden";\s+alter table "installer_notifications" drop column if exists "hidden"/);
  });
});
