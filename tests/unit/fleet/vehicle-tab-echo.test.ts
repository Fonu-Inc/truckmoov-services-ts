import { describe, expect, it, vi } from "vitest";
import { VehiclesController } from "../../../apps/fleet/src/vehicles.controller";

const VEHICLES = [{ id: "v1", plateNumber: "ABC-123" }];

function controllerWith(listVehicles: { execute: (...args: unknown[]) => Promise<unknown> }): VehiclesController {
  const rest = Array.from({ length: 19 }, () => ({}));
  return Reflect.construct(VehiclesController, [{}, {}, listVehicles, ...rest]);
}

const req = { user: { tenantId: "tenant-a", userId: "u1", role: "OWNER_OPERATOR" } } as never;

describe("vehicles list tab echo", () => {
  it("echoes tab on the default vehicles response", async () => {
    const controller = controllerWith({ execute: vi.fn(async () => VEHICLES) });

    const result = (await controller.listVehicles({} as never, req)) as unknown as Record<string, unknown>;

    expect(result).toEqual({ status: true, message: "success", tab: "vehicles", data: VEHICLES });
  });

  it("echoes vehicles when an unknown tab falls back", async () => {
    const controller = controllerWith({ execute: vi.fn(async () => VEHICLES) });

    const result = (await controller.listVehicles({} as never, req, "fule")) as unknown as Record<string, unknown>;

    expect(result.tab).toBe("vehicles");
    expect(result.data).toEqual(VEHICLES);
  });
});
