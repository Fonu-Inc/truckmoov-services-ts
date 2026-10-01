import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DriversController } from "../../../apps/fleet/src/drivers.controller";

function controller(owned: Set<string> | null) {
  const getDriverUseCase = { execute: vi.fn(async (id: string) => ({ id, name: "Driver" })) };
  const instance = Object.assign(Object.create(DriversController.prototype), {
    getDriverUseCase,
    driverBehaviorUseCase: { scoresForDrivers: vi.fn(async () => new Map()) },
    ownedDriverIds: vi.fn(async () => owned),
    tenantIdFromRequest: () => "t1",
    runFleetUseCase: (fn: () => Promise<unknown>) => fn(),
  }) as DriversController;
  return { instance, getDriverUseCase };
}

describe("GET /fleet/drivers/:id for an owner operator", () => {
  // /detail and /behavior already refused another owner's driver; the plain
  // read did not, so it gave away any driver in the account.
  it("refuses another owner's driver as not found", async () => {
    const { instance, getDriverUseCase } = controller(new Set(["mine"]));

    await expect(instance.getDriver("theirs", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(getDriverUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns their own driver, and any driver to an unlimited caller", async () => {
    await expect(controller(new Set(["mine"])).instance.getDriver("mine", {} as never)).resolves.toMatchObject({ id: "mine" });
    await expect(controller(null).instance.getDriver("anyone", {} as never)).resolves.toMatchObject({ id: "anyone" });
  });
});
