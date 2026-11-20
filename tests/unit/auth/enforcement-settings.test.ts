import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PORTALS_KEY, REQUIREMENT_KEY, neededPermissions, type Requirement } from "@shared/access";
import { UpdateEnforcementSettingsUseCase } from "../../../apps/auth/src/contexts/onboarding/application/use-cases/billing/update-enforcement-settings.use-case";
import { GetEnforcementSettingsUseCase } from "../../../apps/auth/src/contexts/onboarding/application/use-cases/billing/get-enforcement-settings.use-case";
import { InMemoryEnforcementSettingsRepository } from "../../../apps/auth/src/in-memory-enforcement.repositories";
import { SystemBillingEnforcementController } from "../../../apps/auth/src/system-billing-enforcement.controller";
import type { BillingActor } from "../../../apps/auth/src/contexts/onboarding/domain/ports/billing-audit.port";

const actor = (role: string, tenantId = "system"): BillingActor => ({
  userId: "u1",
  name: "Staff",
  email: "s@x.co",
  role,
  tenantId,
});

function setup() {
  const settings = new InMemoryEnforcementSettingsRepository();
  const entries: { actor: BillingActor; entry: any }[] = [];
  const audit = { record: async (a: BillingActor, entry: any) => void entries.push({ actor: a, entry }) };
  return { settings, entries, update: new UpdateEnforcementSettingsUseCase(settings, audit), get: new GetEnforcementSettingsUseCase(settings) };
}

const reason = "Owner approved go-live";

describe("enforcement settings", () => {
  it("ships off with 3 days grace, cap 10, not paused", async () => {
    const { get } = setup();
    const { data } = await get.execute(actor("SUPER_ADMIN"));
    expect(data).toMatchObject({
      graceDays: 3,
      autoSuspendEnabled: false,
      autoSuspendCapPerRun: 10,
      paused: false,
      limits: { graceDays: { min: 0, max: 30 }, autoSuspendCapPerRun: { min: 1, max: 200 } },
    });
  });

  it("lets a system admin change grace days and writes one audit row with from/to", async () => {
    const { update, entries } = setup();
    const { data } = await update.execute(actor("SYSTEM_ADMIN"), { graceDays: 5, reason });
    expect(data.graceDays).toBe(5);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry).toMatchObject({
      action: "system.billing.enforcement_settings_changed",
      entityType: "billing_enforcement_settings",
      entityId: "system",
      metadata: { changes: [{ key: "graceDays", from: 3, to: 5 }], reason },
    });
  });

  it("defaults the self-serve trial override to none, then sets and clears it", async () => {
    const { get, update, entries } = setup();
    expect((await get.execute(actor("SUPER_ADMIN"))).data.onboardingTrialDaysOverride).toBeNull();

    const set = await update.execute(actor("SYSTEM_ADMIN"), { onboardingTrialDaysOverride: 30, reason });
    expect(set.data.onboardingTrialDaysOverride).toBe(30);

    const cleared = await update.execute(actor("SYSTEM_ADMIN"), { onboardingTrialDaysOverride: null, reason });
    expect(cleared.data.onboardingTrialDaysOverride).toBeNull();
    expect(entries).toHaveLength(2);
  });

  it("rejects a trial override outside 1 to 90 days", async () => {
    const { update } = setup();
    await expect(update.execute(actor("SYSTEM_ADMIN"), { onboardingTrialDaysOverride: 0, reason })).rejects.toThrow();
    await expect(update.execute(actor("SYSTEM_ADMIN"), { onboardingTrialDaysOverride: 91, reason })).rejects.toThrow();
  });

  it("writes nothing when values are unchanged", async () => {
    const { update, entries } = setup();
    await update.execute(actor("SUPER_ADMIN"), { graceDays: 3, paused: false, reason });
    expect(entries).toHaveLength(0);
  });

  it("only a super admin can switch automatic suspension on; either can switch it off", async () => {
    const { update } = setup();
    await expect(update.execute(actor("SYSTEM_ADMIN"), { autoSuspendEnabled: true, reason })).rejects.toThrow(
      /super admin/i,
    );
    await update.execute(actor("SUPER_ADMIN"), { autoSuspendEnabled: true, reason });
    const { data } = await update.execute(actor("SYSTEM_ADMIN"), { autoSuspendEnabled: false, reason });
    expect(data.autoSuspendEnabled).toBe(false);
  });

  it("either role can pause; only a super admin can resume", async () => {
    const { update } = setup();
    await update.execute(actor("SYSTEM_ADMIN"), { paused: true, reason });
    await expect(update.execute(actor("SYSTEM_ADMIN"), { paused: false, reason })).rejects.toThrow(/super admin/i);
    const { data } = await update.execute(actor("SUPER_ADMIN"), { paused: false, reason });
    expect(data.paused).toBe(false);
  });

  it("refuses non-staff and customer-tenant users", async () => {
    const { update, get } = setup();
    await expect(update.execute(actor("OWNER_OPERATOR", "t1"), { graceDays: 4, reason })).rejects.toThrow();
    await expect(update.execute(actor("SUPER_ADMIN", "t1"), { graceDays: 4, reason })).rejects.toThrow();
    await expect(get.execute(actor("DISPATCHER"))).rejects.toThrow();
  });

  it.each([
    [{ graceDays: 31, reason }, "Grace days must be a whole number from 0 to 30."],
    [{ graceDays: 1.5, reason }, "Grace days must be a whole number from 0 to 30."],
    [{ graceDays: -1, reason }, "Grace days must be a whole number from 0 to 30."],
    [{ autoSuspendCapPerRun: 0, reason }, "Customers per run limit must be a whole number from 1 to 200."],
    [{ autoSuspendCapPerRun: 201, reason }, "Customers per run limit must be a whole number from 1 to 200."],
    [{ paused: "yes", reason }, "Pause all automatic actions must be on or off."],
    [{ reason }, "Change at least one setting."],
    [{ graceDays: 4 }, "Please give a reason of 5 to 500 characters."],
    [{ graceDays: 4, reason: "ok" }, "Please give a reason of 5 to 500 characters."],
    [{ graceDays: 4, reason: "x".repeat(501) }, "Please give a reason of 5 to 500 characters."],
  ])("rejects %j in plain words", async (input, message) => {
    const { update } = setup();
    await expect(update.execute(actor("SUPER_ADMIN"), input as never)).rejects.toThrow(message);
  });

  it("accepts grace 0 and 30", async () => {
    const { update } = setup();
    expect((await update.execute(actor("SUPER_ADMIN"), { graceDays: 0, reason })).data.graceDays).toBe(0);
    expect((await update.execute(actor("SUPER_ADMIN"), { graceDays: 30, reason })).data.graceDays).toBe(30);
  });
});

describe("enforcement routes", () => {
  const proto = SystemBillingEnforcementController.prototype as unknown as Record<string, object>;
  const classRequirement = Reflect.getMetadata(REQUIREMENT_KEY, SystemBillingEnforcementController) as Requirement;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && Reflect.hasMetadata(METHOD_METADATA, proto[name]))
    .map((name) => {
      const handler = proto[name];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const requirement = (Reflect.getMetadata(REQUIREMENT_KEY, handler) ?? classRequirement) as Requirement;
      return `${method} ${Reflect.getMetadata(PATH_METADATA, handler)} ${neededPermissions(requirement, method).join(",")}`;
    })
    .sort();

  it("serves under system/billing in the admin portal", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemBillingEnforcementController)).toBe("system/billing");
    expect(Reflect.getMetadata(PORTALS_KEY, SystemBillingEnforcementController)).toEqual(["admin"]);
  });

  it("reads need billing.read and the settings change needs billing.manage", () => {
    expect(routes).toEqual([
      "GET enforcement admin.billing.read",
      "GET enforcement-settings admin.billing.read",
      "GET enforcement/preview admin.billing.read",
      "PUT enforcement-settings admin.billing.manage",
    ]);
  });

  it("ships a seven day renewal lead time with a 1 to 60 range", async () => {
    const { get } = setup();
    const { data } = await get.execute(actor("SUPER_ADMIN"));
    expect(data).toMatchObject({ renewalLeadDays: 7, limits: { renewalLeadDays: { min: 1, max: 60 } } });
  });

  it("lets a system admin change the renewal lead time and audits it", async () => {
    const { update, entries } = setup();
    const { data } = await update.execute(actor("SYSTEM_ADMIN"), { renewalLeadDays: 14, reason });
    expect(data.renewalLeadDays).toBe(14);
    expect(entries[0].entry.metadata.changes).toEqual([{ key: "renewalLeadDays", from: 7, to: 14 }]);
  });

  it.each([0, 61, 2.5, "7", null])("rejects renewal lead time %s", async (value) => {
    const { update } = setup();
    await expect(update.execute(actor("SUPER_ADMIN"), { renewalLeadDays: value, reason })).rejects.toThrow(/Renewal invoice lead time/);
  });
});
