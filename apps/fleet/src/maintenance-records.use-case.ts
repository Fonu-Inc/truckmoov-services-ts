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
import { VEHICLE_REPOSITORY } from "./contexts/fleet/vehicles";
import type { VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";

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
    const byId = await this.vehicleRepo.findById(vehicleId);
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

  async list(tenantId: string, filters?: MaintenanceRecordFilters) {
    const records = await this.repo.findAllByTenant(tenantId, filters);
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
  private async findRaw(tenantId: string, id: string): Promise<StoredMaintenanceRecord> {
    const rec = await this.repo.findById(id);
    if (!rec || rec.tenantId !== tenantId) throw new MaintenanceRecordNotFoundError();
    return rec;
  }

  async findOne(tenantId: string, id: string) {
    return this.withPlateNumber(await this.findRaw(tenantId, id));
  }

  async create(tenantId: string, data: CreateMaintenanceRecordInput) {
    // The UI submits the vehicle registration/plate as vehicleId. Store the
    // canonical vehicle UUID when it resolves, so the record links correctly
    // and enrichment (plate/reg) works. Fall back to the raw value if it
    // resolves to nothing, so create still succeeds rather than hard-failing.
    const vehicle = await this.resolveVehicle(data.vehicleId, tenantId);
    const record: StoredMaintenanceRecord = {
      id: randomUUID(),
      tenantId,
      vehicleId: vehicle?.id ?? data.vehicleId,
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

  async update(tenantId: string, id: string, data: Partial<Omit<StoredMaintenanceRecord, "id" | "tenantId" | "createdAt">>) {
    const existing = await this.findRaw(tenantId, id);
    const updated: StoredMaintenanceRecord = { ...existing, ...data, updatedAt: new Date() };
    await this.repo.save(updated);
    return this.withPlateNumber(updated);
  }

  async delete(tenantId: string, id: string) {
    await this.findRaw(tenantId, id);
    await this.repo.deleteById(id);
  }

  async transition(tenantId: string, id: string, status: MaintenanceRecordStatus) {
    const existing = await this.findRaw(tenantId, id);
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

  async summary(tenantId: string) {
    const records = await this.repo.findAllByTenant(tenantId);
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

  async export(tenantId: string): Promise<string> {
    const records = await this.repo.findAllByTenant(tenantId);
    const headers = ["id", "vehicleId", "maintenanceType", "status", "priority", "scheduledDate", "completedDate", "cost", "currency", "technician"];
    const rows = [
      headers.join(","),
      ...records.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(",")),
    ];
    return rows.join("\n");
  }
}
