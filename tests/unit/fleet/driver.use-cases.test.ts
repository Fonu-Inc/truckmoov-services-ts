import { describe, expect, it } from "vitest";
import { BulkImportDriversUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/bulk-import-drivers.use-case";
import { CreateDriverUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/create-driver.use-case";
import { DeleteDriverUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/delete-driver.use-case";
import { DriverNotFoundError } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/errors/driver-not-found.error";
import { InMemoryDriverRepository } from "../../../apps/fleet/src/contexts/fleet/drivers/infrastructure/repositories/in-memory-driver.repository";
import { CreateVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/create-vehicle.use-case";
import { AssignDriverToVehicleUseCase } from "../../../apps/fleet/src/contexts/fleet/vehicles/application/use-cases/assign-driver-to-vehicle.use-case";
import { SetDriverStatusUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/set-driver-status.use-case";
import { InMemoryVehicleRepository } from "../../../apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/in-memory-vehicle.repository";

const fakeRuntime = {
  generateId: () => "generated-id",
  getDefaultTenantId: () => "default",
};

describe("Fleet driver and assignment use-cases", () => {
  it("creates and deletes a driver", async () => {
    const driverRepository = new InMemoryDriverRepository();
    const vehicleRepository = new InMemoryVehicleRepository();
    const createUseCase = new CreateDriverUseCase(driverRepository, fakeRuntime as any);
    const deleteUseCase = new DeleteDriverUseCase(driverRepository, vehicleRepository);

    const created = await createUseCase.execute({
      name: "John Doe",
      licenseNumber: "LIC-1234",
      tenantId: "default",
    });

    expect(created.name).toBe("John Doe");

    const deleted = await deleteUseCase.execute(created.id);
    expect(deleted).toEqual({ deleted: true, id: created.id });

    await expect(() => deleteUseCase.execute(created.id)).rejects.toBeInstanceOf(
      DriverNotFoundError,
    );
  });

  it("assigns a driver to a vehicle and unassigns on driver deactivation", async () => {
    const driverRepository = new InMemoryDriverRepository();
    const vehicleRepository = new InMemoryVehicleRepository();
    const createDriver = new CreateDriverUseCase(driverRepository, fakeRuntime as any);
    const createVehicle = new CreateVehicleUseCase(vehicleRepository, fakeRuntime as any);
    const assignDriver = new AssignDriverToVehicleUseCase(vehicleRepository, driverRepository);
    const setDriverStatus = new SetDriverStatusUseCase(driverRepository, vehicleRepository);

    const driver = await createDriver.execute({
      name: "Lara Ade",
      licenseNumber: "DRV-556",
      tenantId: "default",
    });
    const vehicle = await createVehicle.execute({
      plateNumber: "TM-556",
      model: "DAF CF",
      tenantId: "default",
    });

    const assignment = await assignDriver.execute({
      driverId: driver.id,
      vehicleId: vehicle.id,
    });

    expect(assignment.vehicle.assignedDriverId).toBe(driver.id);
    expect(assignment.driver.assignedVehicleId).toBe(vehicle.id);

    const deactivated = await setDriverStatus.execute({
      id: driver.id,
      status: "inactive",
    });

    expect(deactivated.status).toBe("inactive");
    expect(deactivated.assignedVehicleId).toBeNull();

    const vehicleAfterDeactivate = await vehicleRepository.findById(vehicle.id);
    expect(vehicleAfterDeactivate?.assignedDriverId).toBeNull();
  });

  it("bulk imports drivers and upserts by license number", async () => {
    const driverRepository = new InMemoryDriverRepository();
    const bulkImport = new BulkImportDriversUseCase(driverRepository, fakeRuntime as any);

    const firstBatch = await bulkImport.execute({
      tenantId: "default",
      items: [
        {
          name: "First Driver",
          licenseNumber: "LIC-0001",
        },
      ],
    });

    expect(firstBatch.created).toBe(1);
    expect(firstBatch.updated).toBe(0);
    expect(firstBatch.records[0]?.status).toBe("active");

    const secondBatch = await bulkImport.execute({
      tenantId: "default",
      items: [
        {
          name: "First Driver Updated",
          licenseNumber: "LIC-0001",
          status: "inactive",
          contactChannels: {
            whatsappNumber: "+2348000000001",
          },
        },
      ],
    });

    expect(secondBatch.created).toBe(0);
    expect(secondBatch.updated).toBe(1);
    expect(secondBatch.records[0]?.name).toBe("First Driver Updated");
    expect(secondBatch.records[0]?.status).toBe("inactive");
    expect(secondBatch.records[0]?.contactChannels.whatsappNumber).toBe(
      "+2348000000001",
    );
  });
});
