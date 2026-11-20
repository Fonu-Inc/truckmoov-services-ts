import { describe, expect, it, vi } from "vitest";
import { InternalNotificationRecipientsController } from "../../../apps/auth/src/internal-notification-recipients.controller";

const user = (id: string, role: string, extra: Record<string, unknown> = {}) =>
  ({ id, email: `${id}@a.com`, passwordHash: "", role, tenantId: "tenant-a", ...extra }) as never;

const DEFAULTS = {
  smsAlerts: false,
  pushAlerts: true,
  incidentAlerts: true,
  jobAssignment: true,
  jobCompletion: true,
  maintenanceReminders: true,
  fuelAlerts: true,
  geofenceAlerts: true,
  emailDigest: false,
};

function harness(users: unknown[], tenant: string | null = "tenant-a") {
  const tenantFor = vi.fn().mockResolvedValue(tenant);
  const findAllByTenant = vi.fn().mockResolvedValue(users);
  const findByTenantId = vi.fn().mockResolvedValue({ organizationType: "aggregator" });
  const controller = new InternalNotificationRecipientsController(
    { tenantFor } as never,
    { findAllByTenant } as never,
    { findByTenantId } as never,
  );
  return { controller, tenantFor, findAllByTenant, findByTenantId };
}

describe("notification recipients route", () => {
  it("answers the notification service only", async () => {
    const { controller, tenantFor, findAllByTenant } = harness([], null);

    await expect(controller.recipients({})).rejects.toThrow("Invalid service token");
    expect(tenantFor).toHaveBeenCalledWith({}, ["notification"]);
    expect(findAllByTenant).not.toHaveBeenCalled();
  });

  it("reads only the tenant the caller acts for", async () => {
    const { controller, findAllByTenant, findByTenantId } = harness([user("u1", "DISPATCHER")]);

    const response = await controller.recipients({});

    expect(findAllByTenant).toHaveBeenCalledWith("tenant-a");
    expect(findByTenantId).toHaveBeenCalledWith("tenant-a");
    expect(response).toEqual({
      status: true,
      message: "success",
      data: [{ id: "u1", role: "DISPATCHER", organizationType: "aggregator", preferences: DEFAULTS }],
    });
  });

  it("leaves out disabled accounts", async () => {
    const { controller } = harness([user("on", "DISPATCHER"), user("off", "DISPATCHER", { accountStatus: "disabled" })]);

    expect((await controller.recipients({})).data.map((r) => r.id)).toEqual(["on"]);
  });

  it("narrows by role and by user id, together or alone", async () => {
    const { controller } = harness([user("d1", "DISPATCHER"), user("f1", "OWNER_OPERATOR"), user("o1", "OWNER_OPERATOR")]);

    expect((await controller.recipients({}, undefined, "DISPATCHER, OWNER_OPERATOR")).data.map((r) => r.id)).toEqual(["d1", "f1", "o1"]);
    expect((await controller.recipients({}, "f1,o1")).data.map((r) => r.id)).toEqual(["f1", "o1"]);
    expect((await controller.recipients({}, "f1,o1", "OWNER_OPERATOR")).data.map((r) => r.id)).toEqual(["f1", "o1"]);
    expect((await controller.recipients({}, "", "")).data).toHaveLength(3);
  });

  it("fills missing toggles with the defaults and reads the legacy keys", async () => {
    const { controller } = harness([
      user("u1", "DISPATCHER", { notificationPreferences: { pushAlerts: false, jobUpdates: false, emailAlerts: true } }),
    ]);

    const [recipient] = (await controller.recipients({})).data;

    expect(recipient.preferences).toEqual({
      ...DEFAULTS,
      pushAlerts: false,
      jobAssignment: false,
      jobCompletion: false,
      emailDigest: true,
    });
  });

  it("reports an unknown organisation as null", async () => {
    const { controller, findByTenantId } = harness([user("u1", "DISPATCHER")]);
    findByTenantId.mockResolvedValue(null);

    expect((await controller.recipients({})).data[0].organizationType).toBeNull();
  });
});
