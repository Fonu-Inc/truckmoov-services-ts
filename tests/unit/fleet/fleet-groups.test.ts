import { beforeEach, describe, expect, it } from "vitest";
import type { FleetGroup, FleetGroupRepository } from "../../../apps/fleet/src/fleet-groups.repository";
import {
  FleetGroupInputError,
  FleetGroupNameTakenError,
  FleetGroupNotFoundError,
  FleetGroupsUseCase,
} from "../../../apps/fleet/src/fleet-groups.use-case";

class InMemoryFleetGroups implements FleetGroupRepository {
  readonly rows = new Map<string, FleetGroup>();
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
  async save(group: FleetGroup) {
    this.rows.set(group.id, { ...group });
  }
  async delete(tenantId: string, id: string) {
    if (this.rows.get(id)?.tenantId === tenantId) this.rows.delete(id);
  }
}

const vehicles = {
  listIdsAndOwnersByTenant: async (tenantId: string) =>
    tenantId === "t1" ? [{ id: "v1", ownerOperatorId: null }, { id: "v2", ownerOperatorId: null }] : [{ id: "v9", ownerOperatorId: null }],
} as never;

describe("Fleets", () => {
  let groups: InMemoryFleetGroups;
  let fleets: FleetGroupsUseCase;

  beforeEach(() => {
    groups = new InMemoryFleetGroups();
    fleets = new FleetGroupsUseCase(groups, vehicles);
  });

  it("creates a fleet with the tenant's vehicles", async () => {
    const fleet = await fleets.create("t1", { name: " Lagos Mainland ", vehicleIds: ["v1", "v2", "v1"], violationsEnabled: true });

    expect(fleet).toMatchObject({ name: "Lagos Mainland", vehicleIds: ["v1", "v2"], violationsEnabled: true });
    expect(await fleets.list("t1")).toHaveLength(1);
  });

  it("refuses another tenant's vehicle", async () => {
    await expect(fleets.create("t1", { name: "Mixed", vehicleIds: ["v9"] })).rejects.toBeInstanceOf(FleetGroupInputError);
  });

  it("refuses a duplicate name, whatever the case", async () => {
    await fleets.create("t1", { name: "Island" });
    await expect(fleets.create("t1", { name: "island" })).rejects.toBeInstanceOf(FleetGroupNameTakenError);
  });

  it("keeps what an update leaves out", async () => {
    const fleet = await fleets.create("t1", { name: "Island", description: "VI and Lekki", vehicleIds: ["v1"] });

    const updated = await fleets.update("t1", fleet.id, { vehicleIds: ["v2"] });

    expect(updated).toMatchObject({ name: "Island", description: "VI and Lekki", vehicleIds: ["v2"] });
  });

  it("does not let another tenant see or delete a fleet", async () => {
    const fleet = await fleets.create("t1", { name: "Island" });

    await expect(fleets.delete("t2", fleet.id)).rejects.toBeInstanceOf(FleetGroupNotFoundError);
    expect(await fleets.list("t2")).toEqual([]);
  });

  it("requires a name", async () => {
    await expect(fleets.create("t1", { name: "  " })).rejects.toBeInstanceOf(FleetGroupInputError);
  });
});
