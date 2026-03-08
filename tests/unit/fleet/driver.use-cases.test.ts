import { describe, expect, it } from "vitest";
import { CreateDriverUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/create-driver.use-case";
import { DeleteDriverUseCase } from "../../../apps/fleet/src/contexts/fleet/drivers/application/use-cases/delete-driver.use-case";
import { DriverNotFoundError } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/errors/driver-not-found.error";
import { InMemoryDriverRepository } from "../../../apps/fleet/src/contexts/fleet/drivers/infrastructure/repositories/in-memory-driver.repository";

describe("Fleet driver use-cases", () => {
  it("creates and deletes a driver", async () => {
    const repository = new InMemoryDriverRepository();
    const createUseCase = new CreateDriverUseCase(repository);
    const deleteUseCase = new DeleteDriverUseCase(repository);

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
});
