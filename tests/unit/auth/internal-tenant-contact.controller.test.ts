import { describe, expect, it, vi } from "vitest";
import {
  InternalTenantContactController,
  pickTenantContact,
} from "../../../apps/auth/src/internal-tenant-contact.controller";

const user = (role: string, email: string, extra: Record<string, unknown> = {}) =>
  ({ id: email, email, passwordHash: "", role, tenantId: "tenant-a", ...extra }) as never;

describe("tenant contact", () => {
  it("prefers the people who dispatch over the organisation's admin", () => {
    const picked = pickTenantContact([user("ENTERPRISE_ADMIN", "admin@a.com"), user("DISPATCHER", "dispatch@a.com")]);

    expect(picked?.email).toBe("dispatch@a.com");
  });

  it("skips disabled accounts and roles nobody should be told through", () => {
    const picked = pickTenantContact([
      user("DISPATCHER", "off@a.com", { accountStatus: "disabled" }),
      user("FINANCE_VIEWER", "finance@a.com"),
      user("OWNER_OPERATOR", "fleet@a.com"),
    ]);

    expect(picked?.email).toBe("fleet@a.com");
  });

  it("finds nobody in a tenant with no suitable user", () => {
    expect(pickTenantContact([user("FINANCE_VIEWER", "finance@a.com")])).toBeNull();
    expect(pickTenantContact([])).toBeNull();
  });
});

describe("tenant contact route", () => {
  const harness = (tenantFor: ReturnType<typeof vi.fn>, users: unknown[]) =>
    new InternalTenantContactController({ tenantFor } as never, { findAllByTenant: vi.fn().mockResolvedValue(users) } as never);

  it("answers the notification service only, for the tenant it acts for", async () => {
    const tenantFor = vi.fn().mockResolvedValue(null);

    await expect(harness(tenantFor, []).contact({})).rejects.toThrow("Invalid service token");
    expect(tenantFor).toHaveBeenCalledWith({}, ["notification"]);
  });

  it("returns the email and the phone number of the chosen user", async () => {
    const controller = harness(vi.fn().mockResolvedValue("tenant-a"), [
      user("DISPATCHER", "dispatch@a.com", { profile: { phoneNumber: "+2348012345678" } }),
    ]);

    const response = await controller.contact({});

    expect(response).toEqual({ status: true, message: "success", data: { email: "dispatch@a.com", phone: "+2348012345678" } });
  });

  it("returns null data when the tenant has no one to tell", async () => {
    const response = await harness(vi.fn().mockResolvedValue("tenant-a"), []).contact({});

    expect(response.data).toBeNull();
  });
});
