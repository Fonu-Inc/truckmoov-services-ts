import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FuelController } from "../../../apps/fleet/src/fuel.controller";

type Fake = { execute: (...args: unknown[]) => Promise<unknown> };

function controllerWith(deps: { listFuel?: Fake; listVehicles?: Fake; listDrivers?: Fake }): FuelController {
  const none = {};
  return Reflect.construct(FuelController, [
    none,
    none,
    none,
    deps.listFuel ?? none,
    none,
    none,
    none,
    none,
    none,
    deps.listVehicles ?? none,
    deps.listDrivers ?? none,
  ]);
}

const req = { user: { tenantId: "tenant-a", userId: "u1", role: "ENTERPRISE_ADMIN" } } as never;

function fuelRow(overrides: Record<string, unknown>) {
  return {
    id: "f1",
    vehicleId: "v1",
    fuelType: "diesel",
    liters: 40,
    pricePerLiter: 1000,
    totalCost: 40000,
    station: "Total Ikeja",
    recordedAt: "2026-09-24T10:00:00.000Z",
    auditTrail: [{ at: "2026-09-24T10:00:00.000Z", by: "u1", action: "create" }],
    vehiclePlateNumber: "ABC-123",
    driverName: "Ada",
    ...overrides,
  };
}

describe("recording fuel against a registration", () => {
  it("names vehicleRegistration on the 400 for an unknown registration", async () => {
    const controller = controllerWith({ listVehicles: { execute: vi.fn(async () => []) } });

    const error = await controller
      .recordFuel({ vehicleRegistration: "XYZ-999", liters: 10, pricePerLiter: 900 } as never, req)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      error: "Bad Request",
      message: "No vehicle is registered as XYZ-999",
      field: "vehicleRegistration",
    });
  });
});

describe("fuel export", () => {
  it("exports only the rows the list filters keep, with formula cells neutralised", async () => {
    const listFuel = {
      execute: vi.fn(async () => [
        fuelRow({ id: "keep", station: "=HYPERLINK(\"x\")" }),
        fuelRow({ id: "petrol", fuelType: "petrol" }),
      ]),
    };
    const controller = controllerWith({ listFuel });
    const res = { setHeader: vi.fn(), send: vi.fn() };

    await controller.exportFuel({ fuelType: "diesel", from: "2026-09-01" } as never, req, res);

    expect(listFuel.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", from: "2026-09-01" }));
    const csv = res.send.mock.calls[0][0] as string;
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("keep");
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toContain("petrol");
  });

  it("sends the header row when no transaction matches, not an empty file", async () => {
    const controller = controllerWith({ listFuel: { execute: vi.fn(async () => []) } });
    const res = { setHeader: vi.fn(), send: vi.fn() };

    await controller.exportFuel({} as never, req, res);

    expect(res.send).toHaveBeenCalledWith(
      "id,tenantId,vehicleId,driverId,vehicleType,fuelType,liters,pricePerLiter,totalCost,station,odometer,recordedAt,recordedBy,deletedAt,auditTrail,vehiclePlateNumber,driverName",
    );
  });
});
