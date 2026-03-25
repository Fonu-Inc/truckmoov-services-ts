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
      firstName: "John",
      lastName: "Doe",
      phone: "+2348000000001",
      email: "john@example.com",
      licenseNumber: "LIC-1234",
      licenseExpiryDate: "2026-08-15",
      communicationPreference: "whatsapp",
      status: "available",
      tenantId: "default",
    });

    expect(created.name).toBe("John Doe");
    expect(created.firstName).toBe("John");
    expect(created.phone).toBe("+2348000000001");
    expect(created.status).toBe("available");

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
      firstName: "Lara",
      lastName: "Ade",
      phone: "+2348000000002",
      licenseNumber: "DRV-556",
      licenseExpiryDate: "2026-10-01",
      status: "available",
      tenantId: "default",
    });
    const vehicle = await createVehicle.execute({
      registrationNumber: "TM-556",
      vin: "1HGCM82633A556556",
      make: "DAF",
      model: "CF",
      year: 2024,
      type: "truck",
      capacity: 16,
      tenantId: "default",
    });

    const assignment = await assignDriver.execute({
      driverId: driver.id,
      vehicleId: vehicle.id,
    });

    expect(assignment.vehicle.assignedDriverId).toBe(driver.id);
    expect(assignment.driver.assignedVehicleId).toBe(vehicle.id);
    expect(assignment.vehicle.registrationNumber).toBe("TM-556");
    expect(assignment.vehicle.vin).toBe("1HGCM82633A556556");

    const deactivated = await setDriverStatus.execute({
      id: driver.id,
      status: "offline",
    });

    expect(deactivated.status).toBe("offline");
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
          firstName: "First",
          lastName: "Driver",
          phone: "+2348000000003",
          licenseNumber: "LIC-0001",
          licenseExpiryDate: "2026-08-15",
          status: "available",
        },
      ],
    });

    expect(firstBatch.created).toBe(1);
    expect(firstBatch.updated).toBe(0);
    expect(firstBatch.records[0]?.status).toBe("available");

    const secondBatch = await bulkImport.execute({
      tenantId: "default",
      items: [
        {
          firstName: "First",
          lastName: "Driver Updated",
          phone: "+2348000000001",
          licenseNumber: "LIC-0001",
          status: "offline",
          communicationPreference: "whatsapp",
          contactChannels: {
            whatsappNumber: "+2348000000001",
          },
        },
      ],
    });

    expect(secondBatch.created).toBe(0);
    expect(secondBatch.updated).toBe(1);
    expect(secondBatch.records[0]?.name).toBe("First Driver Updated");
    expect(secondBatch.records[0]?.status).toBe("offline");
    expect(secondBatch.records[0]?.contactChannels.whatsappNumber).toBe(
      "+2348000000001",
    );
  });
});
