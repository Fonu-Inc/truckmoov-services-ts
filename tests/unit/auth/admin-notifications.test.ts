import { describe, expect, it, vi } from "vitest";
import { InMemoryAdminNotificationRepository } from "../../../apps/auth/src/in-memory-admin-notification.repository";
import {
  AdminNotificationsUseCases,
  NoAlertSwitchedOnError,
  SendTestAlertUseCase,
} from "../../../apps/auth/src/admin-notifications.use-cases";
import type { PlatformAlertSetting } from "../../../apps/auth/src/platform-alert-settings.repository";

function actorTokens(userId: string) {
  return {
    tokenService: { resolveAccessToken: () => ({ id: userId, tenantId: "system", role: "SYSTEM_ADMIN" }) } as never,
    userRepository: {
      findById: async (id: string) => ({ id, email: `${id}@truckmoov.com`, role: "SYSTEM_ADMIN", tenantId: "system", accountStatus: "enabled" }),
    } as never,
  };
}

function useCases(repository: InMemoryAdminNotificationRepository, userId = "admin-1") {
  const { tokenService, userRepository } = actorTokens(userId);
  return new AdminNotificationsUseCases(tokenService, userRepository, repository);
}

const ALERT = { eventId: "evt-1", alertType: "billing_alerts", severity: "high", title: "Payment failed", body: "Tenant X" };

describe("Admin in-app notifications", () => {
  it("records an alert once however often it is delivered", async () => {
    const repository = new InMemoryAdminNotificationRepository();

    expect(await useCases(repository).record(ALERT)).toEqual({ recorded: true });
    expect(await useCases(repository).record(ALERT)).toEqual({ recorded: false });
    expect((await useCases(repository).list("token", {})).total).toBe(1);
  });

  it("refuses an unknown alert type", async () => {
    await expect(
      useCases(new InMemoryAdminNotificationRepository()).record({ ...ALERT, alertType: "weather" }),
    ).rejects.toThrow("weather is not an alert type");
  });

  it("keeps read state per admin", async () => {
    const repository = new InMemoryAdminNotificationRepository();
    await useCases(repository).record(ALERT);
    const [item] = (await useCases(repository).list("token", {})).items;

    expect(await useCases(repository, "admin-1").markRead("token", item.id)).toEqual({ unread: 0 });

    const other = await useCases(repository, "admin-2").list("token", {});
    expect(other.unread).toBe(1);
    expect(other.items[0].readAt).toBeNull();
  });

  it("reports a missing notification as not found", async () => {
    await expect(
      useCases(new InMemoryAdminNotificationRepository()).markRead("token", "nope"),
    ).rejects.toThrow("Notification not found");
  });
});

describe("Test alert", () => {
  function settings(rows: Partial<PlatformAlertSetting>[]) {
    return { findAll: async () => rows as PlatformAlertSetting[] } as never;
  }

  it("raises a critical alert on the first switched-on type", async () => {
    const alerts = { raise: vi.fn(async () => {}) };
    const { tokenService, userRepository } = actorTokens("admin-1");
    const useCase = new SendTestAlertUseCase(
      tokenService,
      userRepository,
      settings([
        { alertType: "new_tenant_signup", enabled: false, channels: ["email"] },
        { alertType: "billing_alerts", enabled: true, channels: ["in_app"] },
      ]),
      alerts as never,
    );

    await expect(useCase.execute("token")).resolves.toEqual({ alertType: "billing_alerts", channels: ["in_app"] });
    expect(alerts.raise).toHaveBeenCalledWith(expect.objectContaining({ alertType: "billing_alerts", severity: "critical" }));
  });

  it("refuses when no alert type is switched on", async () => {
    const { tokenService, userRepository } = actorTokens("admin-1");
    const useCase = new SendTestAlertUseCase(
      tokenService,
      userRepository,
      settings([{ alertType: "billing_alerts", enabled: false, channels: ["email"] }]),
      { raise: vi.fn() } as never,
    );

    await expect(useCase.execute("token")).rejects.toBeInstanceOf(NoAlertSwitchedOnError);
  });
});
