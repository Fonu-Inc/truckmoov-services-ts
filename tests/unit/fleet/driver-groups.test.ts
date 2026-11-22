import { beforeEach, describe, expect, it } from "vitest";
import type { DriverGroup, DriverGroupRepository } from "../../../apps/fleet/src/driver-groups.repository";
import {
  DriverGroupInputError,
  DriverGroupNameTakenError,
  DriverGroupNotFoundError,
  DriverGroupsUseCase,
} from "../../../apps/fleet/src/driver-groups.use-case";

class InMemoryDriverGroups implements DriverGroupRepository {
  readonly rows = new Map<string, DriverGroup>();
  async listByTenant(tenantId: string) {
    return [...this.rows.values()].filter((g) => g.tenantId === tenantId);
  }
  async findById(tenantId: string, id: string) {
    const g = this.rows.get(id);
    return g && g.tenantId === tenantId ? { ...g } : null;
  }
  async findByName(tenantId: string, name: string) {
    return [...this.rows.values()].find((g) => g.tenantId === tenantId && g.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async save(group: DriverGroup) {
    this.rows.set(group.id, { ...group });
  }
  async delete(tenantId: string, id: string) {
    if (this.rows.get(id)?.tenantId === tenantId) this.rows.delete(id);
  }
}

const drivers = {
  findByIds: async (ids: string[], tenantId: string) =>
    ids.filter((id) => (tenantId === "t1" ? ["d1", "d2"] : ["d9"]).includes(id)).map((id) => ({ id })),
} as never;

describe("Driver groups", () => {
  let groups: InMemoryDriverGroups;
  let uc: DriverGroupsUseCase;

  beforeEach(() => {
    groups = new InMemoryDriverGroups();
    uc = new DriverGroupsUseCase(groups, drivers);
  });

  it("creates a group with the tenant's drivers", async () => {
    const group = await uc.create("t1", { name: " Lagos Mainland ", driverIds: ["d1", "d2", "d1"], violationsEnabled: true });

    expect(group).toMatchObject({ name: "Lagos Mainland", driverIds: ["d1", "d2"], violationsEnabled: true });
    expect(await uc.list("t1")).toHaveLength(1);
  });

  it("refuses another tenant's driver", async () => {
    await expect(uc.create("t1", { name: "Mixed", driverIds: ["d9"] })).rejects.toBeInstanceOf(DriverGroupInputError);
  });

  it("refuses a duplicate name, whatever the case", async () => {
    await uc.create("t1", { name: "Island" });
    await expect(uc.create("t1", { name: "island" })).rejects.toBeInstanceOf(DriverGroupNameTakenError);
  });

  it("keeps what an update leaves out", async () => {
    const group = await uc.create("t1", { name: "Island", description: "VI and Lekki", driverIds: ["d1"] });

    const updated = await uc.update("t1", group.id, { driverIds: ["d2"] });

    expect(updated).toMatchObject({ name: "Island", description: "VI and Lekki", driverIds: ["d2"] });
  });

  it("does not let another tenant see or delete a group", async () => {
    const group = await uc.create("t1", { name: "Island" });

    await expect(uc.delete("t2", group.id)).rejects.toBeInstanceOf(DriverGroupNotFoundError);
    expect(await uc.list("t2")).toEqual([]);
  });

  it("requires a name", async () => {
    await expect(uc.create("t1", { name: "  " })).rejects.toBeInstanceOf(DriverGroupInputError);
  });

  it("keeps a driver in one group at most", async () => {
    const day = await uc.create("t1", { name: "Day", driverIds: ["d1"] });
    await expect(uc.create("t1", { name: "Night", driverIds: ["d1"] })).rejects.toBeInstanceOf(DriverGroupInputError);
    await expect(uc.update("t1", day.id, { driverIds: ["d1", "d2"] })).resolves.toMatchObject({ driverIds: ["d1", "d2"] });
  });
});
