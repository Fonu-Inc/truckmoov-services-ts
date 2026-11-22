import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { FLEET_GROUP_REPOSITORY, type FleetGroup, type FleetGroupRepository } from "./fleet-groups.repository";

export class FleetGroupNotFoundError extends Error {
  constructor() {
    super("Fleet not found");
  }
}

export class FleetGroupNameTakenError extends Error {
  constructor() {
    super("A fleet with this name already exists");
  }
}

export class FleetGroupInputError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export type FleetGroupInput = {
  name?: string;
  description?: string | null;
  vehicleIds?: string[];
  violationsEnabled?: boolean;
};

const NAME_MAX = 80;
const DESCRIPTION_MAX = 240;

export function toFleetGroupView(group: FleetGroup) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    violationsEnabled: group.violationsEnabled,
    vehicleIds: group.vehicleIds,
    vehicleCount: group.vehicleIds.length,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

@Injectable()
export class FleetGroupsUseCase {
  constructor(
    @Inject(FLEET_GROUP_REPOSITORY) private readonly groups: FleetGroupRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
  ) {}

  list(tenantId: string): Promise<FleetGroup[]> {
    return this.groups.listByTenant(tenantId);
  }

  async get(tenantId: string, id: string): Promise<FleetGroup> {
    const group = await this.groups.findById(tenantId, id);
    if (!group) throw new FleetGroupNotFoundError();
    return group;
  }

  async create(tenantId: string, input: FleetGroupInput, now = new Date()): Promise<FleetGroup> {
    const name = this.validName(input.name);
    if (await this.groups.findByName(tenantId, name)) throw new FleetGroupNameTakenError();
    const group: FleetGroup = {
      id: randomUUID(),
      tenantId,
      name,
      description: this.validDescription(input.description),
      violationsEnabled: input.violationsEnabled === true,
      vehicleIds: await this.validVehicles(tenantId, input.vehicleIds ?? [], null),
      createdAt: now,
      updatedAt: now,
    };
    await this.groups.save(group);
    return group;
  }

  async update(tenantId: string, id: string, input: FleetGroupInput, now = new Date()): Promise<FleetGroup> {
    const existing = await this.get(tenantId, id);
    const name = input.name === undefined ? existing.name : this.validName(input.name);
    const clash = name === existing.name ? null : await this.groups.findByName(tenantId, name);
    if (clash && clash.id !== id) throw new FleetGroupNameTakenError();
    const group: FleetGroup = {
      ...existing,
      name,
      description: input.description === undefined ? existing.description : this.validDescription(input.description),
      violationsEnabled: input.violationsEnabled ?? existing.violationsEnabled,
      vehicleIds: input.vehicleIds === undefined ? existing.vehicleIds : await this.validVehicles(tenantId, input.vehicleIds, id),
      updatedAt: now,
    };
    await this.groups.save(group);
    return group;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.get(tenantId, id);
    await this.groups.delete(tenantId, id);
  }

  private validName(value: unknown): string {
    const name = String(value ?? "").trim();
    if (!name || name.length > NAME_MAX) throw new FleetGroupInputError("name", `Fleet name is required (at most ${NAME_MAX} characters)`);
    return name;
  }

  private validDescription(value: unknown): string | null {
    const description = String(value ?? "").trim();
    if (description.length > DESCRIPTION_MAX) {
      throw new FleetGroupInputError("description", `Description must be at most ${DESCRIPTION_MAX} characters`);
    }
    return description || null;
  }

  /**
   * Only the tenant's own vehicles can be grouped, and a vehicle sits in one
   * fleet at most. An unknown or taken id is refused rather than dropped.
   */
  private async validVehicles(tenantId: string, vehicleIds: string[], fleetId: string | null): Promise<string[]> {
    const wanted = [...new Set(vehicleIds)];
    if (wanted.length === 0) return [];
    const known = new Set((await this.vehicles.listIdsAndOwnersByTenant(tenantId)).map((vehicle) => vehicle.id));
    const unknown = wanted.filter((vehicleId) => !known.has(vehicleId));
    if (unknown.length > 0) throw new FleetGroupInputError("vehicleIds", `Unknown vehicle: ${unknown.join(", ")}`);
    for (const other of await this.groups.listByTenant(tenantId)) {
      if (other.id === fleetId) continue;
      const taken = wanted.find((vehicleId) => other.vehicleIds.includes(vehicleId));
      if (taken) throw new FleetGroupInputError("vehicleIds", `Vehicle ${taken} is already in ${other.name}`);
    }
    return wanted;
  }
}
