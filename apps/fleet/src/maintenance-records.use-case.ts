import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  MAINTENANCE_RECORD_REPOSITORY,
  type CreateMaintenanceRecordInput,
  type MaintenanceRecordFilters,
  type MaintenanceRecordRepository,
  type MaintenanceRecordStatus,
  type StoredMaintenanceRecord,
} from "./maintenance-record.repository";
import { VEHICLE_REPOSITORY, VehicleNotFoundError } from "./contexts/fleet/vehicles";
import type { VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { isVehicleAllowed, onlyAllowedVehicles, type AllowedVehicleIds } from "./allowed-vehicles";

export class MaintenanceRecordNotFoundError extends Error {}

type WithVehiclePlateNumber<T> = T & { vehiclePlateNumber: string | null; vehicleRegistrationNumber: string | null };

@Injectable()
export class MaintenanceRecordsUseCase {
  constructor(
    @Inject(MAINTENANCE_RECORD_REPOSITORY)
    private readonly repo: MaintenanceRecordRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepo: VehicleRepository,
  ) {}

  /**
   * Resolves a vehicle from a value that may be either a real vehicle UUID
   * or a plate/registration string. The "Schedule Maintenance" UI submits
   * the vehicle *registration* (a plate string) as vehicleId, so a plain
   * findById misses and enrichment came back null. Try id first, then fall
   * back to plate lookup (registrationNumber is an alias of plateNumber).
   */
  private async resolveVehicle(vehicleId: string, tenantId: string) {
    const byId = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (byId) return byId;
    return this.vehicleRepo.findByPlateNumber(vehicleId, tenantId);
  }

  private async withPlateNumber(rec: StoredMaintenanceRecord): Promise<WithVehiclePlateNumber<StoredMaintenanceRecord>> {
    const vehicle = await this.resolveVehicle(rec.vehicleId, rec.tenantId);
    const primitives = vehicle?.toPrimitives();
    return {
      ...rec,
      vehiclePlateNumber: primitives?.plateNumber ?? null,
      vehicleRegistrationNumber: primitives?.registrationNumber ?? primitives?.plateNumber ?? null,
    };
  }

  /**
   * The vehicle a limited caller names must resolve to one of theirs; anything
   * else reads as an unknown vehicle.
   */
  private async allowedVehicleId(value: string, tenantId: string, allowed: ReadonlySet<string>): Promise<string> {
    const vehicle = await this.resolveVehicle(value, tenantId);
    if (!vehicle || !allowed.has(vehicle.id)) throw new VehicleNotFoundError(value);
    return vehicle.id;
  }

  async list(tenantId: string, filters?: MaintenanceRecordFilters, allowed?: AllowedVehicleIds) {
    const records = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId, filters), allowed);
    return Promise.all(records.map((rec) => this.withPlateNumber(rec)));
  }

  /**
   * Fetches the RAW stored record (no plate/reg enrichment). Mutations
   * (update/transition/delete) must build on this — never on findOne's
   * enriched result — because vehiclePlateNumber/vehicleRegistrationNumber
   * are response-only fields, NOT DB columns. Persisting an enriched object
   * makes MikroORM's upsert emit those phantom columns and the insert fails
   * with "column vehiclePlateNumber ... does not exist".
   */
  private async findRaw(tenantId: string, id: string, allowed?: AllowedVehicleIds): Promise<StoredMaintenanceRecord> {
    const rec = await this.repo.findById(id, tenantId);
    // Another owner's record reads as missing, not as forbidden.
    if (!rec || rec.tenantId !== tenantId || !isVehicleAllowed(rec.vehicleId, allowed)) {
      throw new MaintenanceRecordNotFoundError();
    }
    return rec;
  }

  async findOne(tenantId: string, id: string, allowed?: AllowedVehicleIds) {
    return this.withPlateNumber(await this.findRaw(tenantId, id, allowed));
  }

  async create(tenantId: string, data: CreateMaintenanceRecordInput, allowed?: AllowedVehicleIds) {
    // The UI submits the vehicle registration/plate as vehicleId. Store the
    // canonical vehicle UUID when it resolves, so the record links correctly
    // and enrichment (plate/reg) works. Fall back to the raw value if it
    // resolves to nothing, so create still succeeds rather than hard-failing.
    const vehicleId = allowed
      ? await this.allowedVehicleId(data.vehicleId, tenantId, allowed)
      : (await this.resolveVehicle(data.vehicleId, tenantId))?.id ?? data.vehicleId;
    const record: StoredMaintenanceRecord = {
      id: randomUUID(),
      tenantId,
      vehicleId,
      maintenanceType: data.maintenanceType,
      status: data.status ?? "scheduled",
      priority: data.priority,
      currency: data.currency ?? "NGN",
      description: data.description ?? null,
      scheduledDate: data.scheduledDate ?? null,
      completedDate: data.completedDate ?? null,
      cost: data.cost ?? null,
      technician: data.technician ?? null,
      notes: data.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.repo.save(record);
    return record;
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<Omit<StoredMaintenanceRecord, "id" | "tenantId" | "createdAt">>,
    allowed?: AllowedVehicleIds,
  ) {
    const existing = await this.findRaw(tenantId, id, allowed);
    const changes = allowed && data.vehicleId
      ? { ...data, vehicleId: await this.allowedVehicleId(data.vehicleId, tenantId, allowed) }
      : data;
    const updated: StoredMaintenanceRecord = { ...existing, ...changes, updatedAt: new Date() };
    await this.repo.save(updated);
    return this.withPlateNumber(updated);
  }

  async delete(tenantId: string, id: string, allowed?: AllowedVehicleIds) {
    await this.findRaw(tenantId, id, allowed);
    await this.repo.deleteById(id, tenantId);
  }

  async transition(tenantId: string, id: string, status: MaintenanceRecordStatus, allowed?: AllowedVehicleIds) {
    const existing = await this.findRaw(tenantId, id, allowed);
    const today = new Date().toISOString().slice(0, 10);
    const updated: StoredMaintenanceRecord = {
      ...existing,
      status,
      completedDate: status === "completed" ? today : existing.completedDate,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    return this.withPlateNumber(updated);
  }

  async summary(tenantId: string, allowed?: AllowedVehicleIds) {
    const records = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId), allowed);
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: records.length,
      scheduled: records.filter((r) => r.status === "scheduled").length,
      inProgress: records.filter((r) => r.status === "in_progress").length,
      completed: records.filter((r) => r.status === "completed").length,
      overdue: records.filter((r) => r.status === "scheduled" && (r.scheduledDate ?? "") < today).length,
      totalCostNgn: records.reduce((sum, r) => sum + (r.cost ?? 0), 0),
    };
  }

  async export(tenantId: string, allowed?: AllowedVehicleIds): Promise<string> {
    const records = onlyAllowedVehicles(await this.repo.findAllByTenant(tenantId), allowed);
    const headers = ["id", "vehicleId", "maintenanceType", "status", "priority", "scheduledDate", "completedDate", "cost", "currency", "technician"];
    const rows = [
      headers.join(","),
      ...records.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(",")),
    ];
    return rows.join("\n");
  }
}
