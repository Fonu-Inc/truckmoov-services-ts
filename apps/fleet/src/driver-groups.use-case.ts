import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { DRIVER_GROUP_REPOSITORY, type DriverGroup, type DriverGroupRepository } from "./driver-groups.repository";

export class DriverGroupNotFoundError extends Error {
  constructor() {
    super("Driver group not found");
  }
}

export class DriverGroupNameTakenError extends Error {
  constructor() {
    super("A driver group with this name already exists");
  }
}

export class DriverGroupInputError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export type DriverGroupInput = {
  name?: string;
  description?: string | null;
  driverIds?: string[];
  violationsEnabled?: boolean;
};

const NAME_MAX = 80;
const DESCRIPTION_MAX = 240;

export function toDriverGroupView(group: DriverGroup) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    violationsEnabled: group.violationsEnabled,
    driverIds: group.driverIds,
    driverCount: group.driverIds.length,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

@Injectable()
export class DriverGroupsUseCase {
  constructor(
    @Inject(DRIVER_GROUP_REPOSITORY) private readonly groups: DriverGroupRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
  ) {}

  list(tenantId: string): Promise<DriverGroup[]> {
    return this.groups.listByTenant(tenantId);
  }

  async get(tenantId: string, id: string): Promise<DriverGroup> {
    const group = await this.groups.findById(tenantId, id);
    if (!group) throw new DriverGroupNotFoundError();
    return group;
  }

  async create(tenantId: string, input: DriverGroupInput, now = new Date()): Promise<DriverGroup> {
    const name = this.validName(input.name);
    if (await this.groups.findByName(tenantId, name)) throw new DriverGroupNameTakenError();
    const group: DriverGroup = {
      id: randomUUID(),
      tenantId,
      name,
      description: this.validDescription(input.description),
      violationsEnabled: input.violationsEnabled === true,
      driverIds: await this.validDrivers(tenantId, input.driverIds ?? [], null),
      createdAt: now,
      updatedAt: now,
    };
    await this.groups.save(group);
    return group;
  }

  async update(tenantId: string, id: string, input: DriverGroupInput, now = new Date()): Promise<DriverGroup> {
    const existing = await this.get(tenantId, id);
    const name = input.name === undefined ? existing.name : this.validName(input.name);
    const clash = name === existing.name ? null : await this.groups.findByName(tenantId, name);
    if (clash && clash.id !== id) throw new DriverGroupNameTakenError();
    const group: DriverGroup = {
      ...existing,
      name,
      description: input.description === undefined ? existing.description : this.validDescription(input.description),
      violationsEnabled: input.violationsEnabled ?? existing.violationsEnabled,
      driverIds: input.driverIds === undefined ? existing.driverIds : await this.validDrivers(tenantId, input.driverIds, id),
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
    if (!name || name.length > NAME_MAX) throw new DriverGroupInputError("name", `Group name is required (at most ${NAME_MAX} characters)`);
    return name;
  }

  private validDescription(value: unknown): string | null {
    const description = String(value ?? "").trim();
    if (description.length > DESCRIPTION_MAX) {
      throw new DriverGroupInputError("description", `Description must be at most ${DESCRIPTION_MAX} characters`);
    }
    return description || null;
  }

  /**
   * Only the tenant's own drivers can be grouped, and a driver sits in one group
   * at most. An unknown or taken id is refused rather than dropped.
   */
  private async validDrivers(tenantId: string, driverIds: string[], groupId: string | null): Promise<string[]> {
    const wanted = [...new Set(driverIds)];
    if (wanted.length === 0) return [];
    const known = new Set((await this.drivers.findByIds(wanted, tenantId)).map((driver) => driver.id));
    const unknown = wanted.filter((driverId) => !known.has(driverId));
    if (unknown.length > 0) throw new DriverGroupInputError("driverIds", `Unknown driver: ${unknown.join(", ")}`);
    for (const other of await this.groups.listByTenant(tenantId)) {
      if (other.id === groupId) continue;
      const taken = wanted.find((driverId) => other.driverIds.includes(driverId));
      if (taken) throw new DriverGroupInputError("driverIds", `Driver ${taken} is already in ${other.name}`);
    }
    return wanted;
  }
}
