import { describe, expect, it } from "vitest";
import {
  claimFromStock,
  devicesStillNeeded,
  isHealthyStock,
  orderPlatformStock,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/platform-stock";

const device = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  lifecycleStatus: "assignable",
  vehicleId: null,
  holdCause: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
}) as never;

describe("platform stock", () => {
  it("excludes faulty, suspended, decommissioned, held and fitted devices", () => {
    for (const lifecycleStatus of ["faulty", "suspended", "decommissioned"]) {
      expect(isHealthyStock(device({ lifecycleStatus }))).toBe(false);
    }
    expect(isHealthyStock(device({ holdCause: "non_payment" }))).toBe(false);
    expect(isHealthyStock(device({ vehicleId: "v1" }))).toBe(false);
    expect(isHealthyStock(device())).toBe(true);
  });

  it("orders oldest first and drops unhealthy devices", () => {
    const ordered = orderPlatformStock([
      device({ id: "c", createdAt: "2026-03-01T00:00:00.000Z" }),
      device({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
      device({ id: "x", lifecycleStatus: "faulty", createdAt: "2025-01-01T00:00:00.000Z" }),
      device({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(ordered.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for empty stock", () => {
    expect(orderPlatformStock([])).toEqual([]);
  });

  it("computes what is still needed and never goes negative", () => {
    expect(devicesStillNeeded(10, 0)).toBe(10);
    expect(devicesStillNeeded(10, 4)).toBe(6);
    expect(devicesStillNeeded(10, 10)).toBe(0);
    expect(devicesStillNeeded(10, 12)).toBe(0);
  });

  it("claims in stock order and tops up from later devices when a claim is lost", async () => {
    const stock = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    const tried: string[] = [];
    const claimed = await claimFromStock(stock, 3, async (d) => {
      tried.push(d.id);
      return d.id !== "b";
    });
    expect(claimed).toEqual(["a", "c", "d"]);
    expect(tried).toEqual(["a", "b", "c", "d"]);
  });

  it("claims only what exists when stock is short", async () => {
    expect(await claimFromStock([{ id: "a" }], 3, async () => true)).toEqual(["a"]);
    expect(await claimFromStock([], 3, async () => true)).toEqual([]);
  });
});
