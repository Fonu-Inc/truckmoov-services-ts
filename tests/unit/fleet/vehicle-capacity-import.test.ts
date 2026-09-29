import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BaseFleetController } from "../../../apps/fleet/src/base.controller";
import { BulkImportVehiclesUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/bulk-import-vehicles.use-case";
import { assertCapacityWithinRange, normalizeCapacityUnit } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/vehicle-capacity";
import { parseVehicleCsv } from "../../../apps/fleet/src/contexts/fleet/vehicles/domain/vehicle-csv";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";

class Probe extends BaseFleetController {
  run<T>(fn: () => Promise<T>) {
    return this.runFleetUseCase(fn);
  }
}

const probe = Reflect.construct(Probe, [{}, {}]) as Probe;

async function refusal(fn: () => void) {
  const error = await probe
    .run(async () => fn())
    .catch((err: unknown) => err);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
}

describe("out-of-range capacity", () => {
  it("is a 400 naming the capacity field and the unit's ceiling", async () => {
    expect(await refusal(() => assertCapacityWithinRange(150, "tons"))).toEqual({
      statusCode: 400,
      error: "Bad Request",
      message: "capacity in tons must be 100 or less",
      field: "capacity",
    });
  });

  it("applies to every unit, not just tons", async () => {
    expect(await refusal(() => assertCapacityWithinRange(201, "m3"))).toMatchObject({ field: "capacity" });
    expect(await refusal(() => assertCapacityWithinRange(100_001, "kg"))).toMatchObject({ field: "capacity" });
    expect(await refusal(() => assertCapacityWithinRange(101, "pallets"))).toMatchObject({ field: "capacity" });
  });

  it("accepts the ceiling itself", () => {
    expect(() => assertCapacityWithinRange(200, "m3")).not.toThrow();
  });

  it("names capacityUnit when the unit is the problem", async () => {
    expect(await refusal(() => normalizeCapacityUnit("stones"))).toMatchObject({ field: "capacityUnit" });
  });
});

describe("CSV import capacity_unit", () => {
  const header = "registration_number,make,model,type,capacity,capacity_unit";

  it("reads the unit for each row", () => {
    const parsed = parseVehicleCsv(
      [header, "PRB-901-ZZ,Probe,Van,van,40,m3", "PRB-903-ZZ,Probe,Trailer,trailer,20,pallets"].join("\n"),
    );

    expect(parsed.rows.map((row) => row.capacityUnit)).toEqual(["m3", "pallets"]);
  });

  it("defaults to tons only when the cell is empty", () => {
    const parsed = parseVehicleCsv([header, "PRB-1,Probe,Van,van,10,"].join("\n"));

    expect(parsed.rows[0].capacityUnit).toBe("tons");
  });

  it("skips a row over its unit's ceiling and reports the line", () => {
    const parsed = parseVehicleCsv(
      [header, "PRB-1,Probe,Van,van,10,tons", "PRB-2,Probe,Van,van,300,m3"].join("\n"),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([{ line: 3, message: "capacity in m3 must be 200 or less" }]);
  });
});

describe("bulk import keeps the unit", () => {
  function useCase() {
    const repo = new InMemoryVehicleRepository();
    const runtime = { getDefaultTenantId: () => "t1", generateId: (() => { let n = 0; return () => `v${++n}`; })() };
    return { repo, useCase: Reflect.construct(BulkImportVehiclesUseCase, [repo, runtime]) as BulkImportVehiclesUseCase };
  }

  it("stores each row in its own unit", async () => {
    const { useCase: importer } = useCase();

    const result = await importer.execute({
      tenantId: "t1",
      items: [
        { registrationNumber: "PRB-901-ZZ", model: "Van", capacity: 40, capacityUnit: "m3" },
        { registrationNumber: "PRB-903-ZZ", model: "Trailer", capacity: 20, capacityUnit: "pallets" },
      ],
    });

    expect(result.records.map((r) => [r.capacityUnit, r.capacityVolumeM3 ?? null, r.capacityPallets ?? null])).toEqual([
      ["m3", 40, null],
      ["pallets", null, 20],
    ]);
  });

  it("changes the unit of a vehicle that already exists", async () => {
    const { useCase: importer } = useCase();
    await importer.execute({ tenantId: "t1", items: [{ registrationNumber: "PRB-1", model: "Van", capacity: 30 }] });

    const result = await importer.execute({
      tenantId: "t1",
      items: [{ registrationNumber: "PRB-1", model: "Van", capacity: 40, capacityUnit: "m3" }],
    });

    expect(result.updated).toBe(1);
    expect(result.records[0].capacityUnit).toBe("m3");
  });
});
