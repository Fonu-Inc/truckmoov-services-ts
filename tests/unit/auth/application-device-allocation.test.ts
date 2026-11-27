import { describe, expect, it } from "vitest";
import { ApplicationDeviceAllocationService, owedDevices } from "../../../apps/auth/src/contexts/onboarding/application/services/application-device-allocation.service";
import {
  selectOwedWithStock,
  shouldRaiseShortfallAlert,
} from "../../../apps/auth/src/contexts/onboarding/application/services/application-device-allocation.logic";

describe("owedDevices", () => {
  it("is the requested count less what the tenant already holds", () => {
    expect(owedDevices(10, 0)).toBe(10);
    expect(owedDevices(10, 7)).toBe(3);
  });

  it("is zero once the request is met or exceeded", () => {
    expect(owedDevices(10, 10)).toBe(0);
    expect(owedDevices(10, 15)).toBe(0);
  });
});

describe("ApplicationDeviceAllocationService.allocate", () => {
  const application = { id: "app-1", reference: "REF-1", tenantId: "t1", organizationName: "Acme" } as never;

  const build = (over: { audit?: () => Promise<unknown>; shortfall?: number } = {}) => {
    const audited: string[] = [];
    const bound: string[][] = [];
    const alerts: unknown[] = [];
    const service = new ApplicationDeviceAllocationService(
      { findDeviceRequestsByApplicationId: async () => [{ quantity: 5 }] } as never,
      {
        allocateDevicesFromStock: async () => ({
          ok: true,
          deviceIds: ["d1", "d2", "d3", "d4"],
          held: 4,
          shortfall: over.shortfall ?? 1,
        }),
      } as never,
      { heldBy: async () => 0 } as never,
      {
        record: async (entry: { entityId: string }) => {
          if (over.audit) await over.audit();
          audited.push(entry.entityId);
        },
      } as never,
      { raise: async (alert: unknown) => void alerts.push(alert) } as never,
      { autoBindUnits: async (_t: string, _a: unknown, ids: string[]) => void bound.push(ids) } as never,
      { record: async () => undefined, alertedOwed: async () => null, markAlerted: async () => undefined } as never,
    );
    return { service, audited, bound, alerts };
  };

  it("writes one audit entry per device", async () => {
    const { service, audited } = build();
    await service.allocate(application);
    expect(audited).toEqual(["d1", "d2", "d3", "d4"]);
  });

  it("still binds units and alerts when the audit write fails", async () => {
    const { service, bound, alerts } = build({ audit: async () => { throw new Error("log down"); } });
    await service.allocate(application);
    expect(bound).toHaveLength(1);
    expect(alerts).toHaveLength(1);
  });

  it("raises no alert when nothing is owed", async () => {
    const { service, alerts } = build({ shortfall: 0 });
    await service.allocate(application);
    expect(alerts).toHaveLength(0);
  });
});

describe("allocation selection", () => {
  it("raises one alert per shortfall and again once it changes or clears", () => {
    expect(shouldRaiseShortfallAlert(null, 3)).toBe(true);
    expect(shouldRaiseShortfallAlert(3, 3)).toBe(false);
    expect(shouldRaiseShortfallAlert(3, 2)).toBe(true);
    expect(shouldRaiseShortfallAlert(3, 0)).toBe(false);
  });

  it("reaches applications oldest first until the stock is spent", () => {
    const owing = [{ id: "a", owed: 3 }, { id: "b", owed: 4 }, { id: "c", owed: 2 }];
    expect(selectOwedWithStock(owing, 3).map((r) => r.id)).toEqual(["a"]);
    expect(selectOwedWithStock(owing, 5).map((r) => r.id)).toEqual(["a", "b"]);
    expect(selectOwedWithStock(owing, 100).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("reaches nothing without stock", () => {
    expect(selectOwedWithStock([{ owed: 2 }], 0)).toEqual([]);
  });
});
