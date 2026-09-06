import { describe, expect, it, vi } from "vitest";
import { FleetQuotaExceededError, QuotaService } from "../../../apps/fleet/src/quota.service";
import type { TenantEntitlements } from "../../../apps/fleet/src/entitlement-reader.service";

function build(entitlements: TenantEntitlements | null) {
  const forTenant = vi.fn(async () => entitlements);
  return { service: new QuotaService({ forTenant } as never), forTenant };
}

const blocking = (limit: number | "unlimited"): TenantEntitlements => ({
  planCode: "plan_starter",
  quotas: { vehicles: limit },
  limitBehaviour: { vehicles: "block" },
});

describe("quota enforcement", () => {
  it("admits a create below the limit", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 9)).resolves.toBeUndefined();
  });

  it("refuses the one that would exceed it", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 10)).rejects.toBeInstanceOf(
      FleetQuotaExceededError,
    );
  });

  it("admits any count on an unlimited plan", async () => {
    const { service } = build(blocking("unlimited"));

    await expect(
      service.assertWithinQuota("tenant-a", "vehicles", 1_000_000),
    ).resolves.toBeUndefined();
  });

  // An absent quota is not zero.
  it("enforces nothing for a resource the plan does not mention", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertWithinQuota("tenant-a", "drivers", 5_000)).resolves.toBeUndefined();
  });

  it("enforces nothing when the tenant is on no plan", async () => {
    const { service } = build(null);

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 5_000)).resolves.toBeUndefined();
  });

  it("does not refuse when the plan bills the overage instead of blocking", async () => {
    const { service } = build({
      planCode: "plan_flex",
      quotas: { vehicles: 1 },
      limitBehaviour: { vehicles: "allow_and_bill" },
    });

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 99)).resolves.toBeUndefined();
  });

  it("does not refuse when the plan only warns", async () => {
    const { service } = build({
      planCode: "plan_warn",
      quotas: { vehicles: 1 },
      limitBehaviour: { vehicles: "warn" },
    });

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 99)).resolves.toBeUndefined();
  });

  it("treats a zero quota as a real limit that refuses everything", async () => {
    const { service } = build({
      planCode: "plan_none",
      quotas: { vehicles: 0 },
      limitBehaviour: { vehicles: "block" },
    });

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 0)).rejects.toBeInstanceOf(
      FleetQuotaExceededError,
    );
  });

  it("says what the limit was, so the message is actionable", async () => {
    const { service } = build(blocking(25));

    await expect(service.assertWithinQuota("tenant-a", "vehicles", 25)).rejects.toThrow(
      /allows 25 vehicles/,
    );
  });

  it("does not consult auth without a tenant", async () => {
    const { service, forTenant } = build(blocking(1));

    await service.assertWithinQuota("", "vehicles", 99);

    expect(forTenant).not.toHaveBeenCalled();
  });
});

describe("batch quota enforcement", () => {
  it("admits a batch that fits exactly", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertRoomFor("tenant-a", "vehicles", 7, 3)).resolves.toBeUndefined();
  });

  // A bulk import is one action to the person who started it. Importing part of
  // the file and refusing the rest leaves them reconciling a spreadsheet
  // against an inventory, so the whole batch is refused.
  it("refuses the whole batch when only some of it would fit", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertRoomFor("tenant-a", "vehicles", 7, 4)).rejects.toBeInstanceOf(
      FleetQuotaExceededError,
    );
  });

  it("says how many are in use and how many the import adds", async () => {
    const { service } = build(blocking(10));

    await expect(service.assertRoomFor("tenant-a", "vehicles", 7, 4)).rejects.toThrow(
      "This plan allows 10 vehicles, 7 are in use, and this import adds 4",
    );
  });

  it("enforces nothing for an empty batch", async () => {
    const { service } = build(blocking(1));

    await expect(service.assertRoomFor("tenant-a", "vehicles", 99, 0)).resolves.toBeUndefined();
  });
});

