import { describe, expect, it } from "vitest";
import { ImportPlatformStockUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/import-platform-stock.use-case";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import {
  catalogKey,
  chunk,
  isLuhnValid,
  stockRowProblem,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/platform-stock-import";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { orderPlatformStock } from "../../../apps/fleet/src/contexts/fleet/devices/domain/platform-stock";

function imeiFor(seq: number): string {
  const body = `35999${String(seq).padStart(9, "0")}`;
  for (let check = 0; check < 10; check += 1) if (isLuhnValid(`${body}${check}`)) return `${body}${check}`;
  throw new Error("unreachable");
}

const keys = new Set([catalogKey("Teltonika", "FMB920"), catalogKey("Queclink", "GV300")]);
const catalog = {
  findModel: async () => null,
  findAll: async () => [
    { manufacturer: "Teltonika", model: "FMB920" },
    { manufacturer: "Queclink", model: "GV300" },
  ],
} as never;

function useCase(repo = new InMemoryDeviceRepository()) {
  let next = 0;
  const runtime = { generateId: () => `stock-${(next += 1)}`, getDefaultTenantId: () => "system" } as never;
  return { repo, useCase: new ImportPlatformStockUseCase(repo, runtime, catalog) };
}

describe("isLuhnValid", () => {
  it("accepts a valid number and rejects a wrong check digit or non digits", () => {
    expect(isLuhnValid("490154203237518")).toBe(true);
    expect(isLuhnValid("490154203237519")).toBe(false);
    expect(isLuhnValid("49015420323751x")).toBe(false);
  });
});

describe("stockRowProblem", () => {
  const row = { imei: imeiFor(1), manufacturer: "teltonika", model: "fmb920" };

  it("accepts a catalog model case-insensitively", () => {
    expect(stockRowProblem(row, keys)).toBeNull();
  });

  it.each([
    [{ ...row, imei: "12345" }, "15 digits"],
    [{ ...row, imei: "359990000000001" }, "check-digit"],
    [{ ...row, manufacturer: " " }, "manufacturer"],
    [{ ...row, model: "" }, "model"],
    [{ ...row, model: "XYZ" }, "not in the device catalog"],
  ])("refuses %#", (bad, reason) => {
    expect(stockRowProblem(bad, keys)).toContain(reason);
  });
});

describe("chunk", () => {
  it("splits into bounded batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("ImportPlatformStockUseCase", () => {
  it("registers assignable system-tenant stock that allocation can draw", async () => {
    const { repo, useCase: importer } = useCase();
    const rows = Array.from({ length: 1200 }, (_, index) => ({
      imei: imeiFor(index + 1),
      manufacturer: index % 2 ? "Queclink" : "Teltonika",
      model: index % 2 ? "GV300" : "FMB920",
      name: `STOCK-${index + 1}`,
    }));

    const result = await importer.execute(rows);

    expect(result).toMatchObject({ total: 1200, created: 1200, skippedExisting: 0, rejectedTotal: 0 });
    const stock = await repo.findAll({ tenantId: "system" });
    expect(stock).toHaveLength(1200);
    expect(stock[0]).toMatchObject({ lifecycleStatus: "assignable", vehicleId: null, holdCause: null });
    expect(orderPlatformStock(stock)).toHaveLength(1200);
  });

  it("stores the trimmed IMEI and the catalog spelling of manufacturer and model", async () => {
    const { repo, useCase: importer } = useCase();

    await importer.execute([{ imei: ` ${imeiFor(3)} `, manufacturer: " teltonika", model: "fmb920 " }]);

    expect(await repo.findAll({ tenantId: "system" })).toMatchObject([
      { imei: imeiFor(3), manufacturer: "Teltonika", model: "FMB920" },
    ]);
  });

  it("is idempotent and never moves a device held by another tenant", async () => {
    const { repo, useCase: importer } = useCase();
    await repo.save(
      Device.create({
        id: "held",
        imei: imeiFor(7),
        manufacturer: "Teltonika",
        model: "FMB920",
        firmwareVersion: "1",
        tenantId: "t1",
        lifecycleStatus: "decommissioned",
        vehicleId: null,
        signalStrength: null,
        batteryLevel: null,
        lastSeen: null,
        assignedAt: null,
      }),
    );
    const rows = [7, 8].map((n) => ({ imei: imeiFor(n), manufacturer: "Teltonika", model: "FMB920" }));

    expect(await importer.execute(rows)).toMatchObject({ created: 1, skippedExisting: 1 });
    expect(await importer.execute(rows)).toMatchObject({ created: 0, skippedExisting: 2 });
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
    expect(await repo.findAll({ tenantId: "system" })).toHaveLength(1);
  });

  it("rejects bad rows and in-file duplicates without aborting the rest, capping the report", async () => {
    const { useCase: importer } = useCase();
    const good = { imei: imeiFor(1), manufacturer: "Teltonika", model: "FMB920" };
    const bad = Array.from({ length: 250 }, () => ({ imei: "1", manufacturer: "Teltonika", model: "FMB920" }));

    const result = await importer.execute([good, ...bad, good]);

    expect(result.created).toBe(1);
    expect(result.rejectedTotal).toBe(251);
    expect(result.rejected).toHaveLength(200);
    expect(result.rejected[0]).toMatchObject({ line: 2, imei: "1" });
  });
});
