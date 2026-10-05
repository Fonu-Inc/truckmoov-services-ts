import { describe, expect, it } from "vitest";
import { PREDEFINED_ROLES } from "@shared/access";
import { Role } from "@shared/rbac";

const platform = PREDEFINED_ROLES[Role.PLATFORM_ADMIN].permissions;
const system = PREDEFINED_ROLES[Role.SYSTEM_ADMIN].permissions;
const superAdmin = PREDEFINED_ROLES[Role.SUPER_ADMIN].permissions;

// Platform-wide policy, credentials and the audit trail stay with
// SUPER_ADMIN / SYSTEM_ADMIN; PLATFORM_ADMIN runs day-to-day operations.
const RESERVED_FOR_SUPER_AND_SYSTEM = [
  "admin.plans.manage",
  "admin.security.manage",
  "admin.settings.manage",
  "admin.integrations.manage",
  "admin.ai.manage",
  "admin.audit.manage",
];

describe("PLATFORM_ADMIN bundle is least privilege", () => {
  it("holds nothing outside the admin portal", () => {
    expect(platform.filter((p) => !p.startsWith("admin."))).toEqual([]);
  });

  it("holds no staff or governance permission", () => {
    expect(platform.filter((p) => p.startsWith("admin.staff.") || p.startsWith("admin.governance."))).toEqual([]);
  });

  it("holds no platform-wide policy, credential or audit write", () => {
    expect(platform.filter((p) => RESERVED_FOR_SUPER_AND_SYSTEM.includes(p))).toEqual([]);
  });

  it("is a strict subset of SYSTEM_ADMIN and SUPER_ADMIN", () => {
    expect(platform.filter((p) => !system.includes(p))).toEqual([]);
    expect(platform.filter((p) => !superAdmin.includes(p))).toEqual([]);
    expect(platform.length).toBeLessThan(system.length);
  });

  it("can read every admin surface the admin SPA routes to it", () => {
    // Keep in step with truckmoov-web apps/admin/src/shared/lib/routePermissions.ts
    // (minus /settings/team, which needs admin.staff.read on purpose).
    const spaReads = [
      "admin.dashboard.read", "admin.tenants.read", "admin.onboarding_review.read", "admin.installers.read",
      "admin.devices.read", "admin.sims.read", "admin.billing.read", "admin.messaging.read",
      "admin.security.read", "admin.audit.read", "admin.ai.read", "admin.settings.read", "admin.support.read",
    ];
    expect(spaReads.filter((p) => !platform.includes(p as never))).toEqual([]);
  });
});
