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

type WithVehiclePlateNumber<T> = T & { vehiclePlateNumber: string | null };

@Injectable()
export class MaintenanceRecordsUseCase {
  constructor(
    @Inject(MAINTENANCE_RECORD_REPOSITORY)
    private readonly repo: MaintenanceRecordRepository,
    @Inject(VEHICLE_REPOSITORY)
    private readonly vehicleRepo: VehicleRepository,
  ) {}

  private async withPlateNumber(rec: StoredMaintenanceRecord): Promise<WithVehiclePlateNumber<StoredMaintenanceRecord>> {
    const vehicle = await this.vehicleRepo.findById(rec.vehicleId);
    return { ...rec, vehiclePlateNumber: vehicle?.toPrimitives().plateNumber ?? null };
  }

  async list(tenantId: string, filters?: MaintenanceRecordFilters) {
    const records = await this.repo.findAllByTenant(tenantId, filters);
    return Promise.all(records.map((rec) => this.withPlateNumber(rec)));
  }

  async findOne(tenantId: string, id: string) {
    const rec = await this.repo.findById(id);
    if (!rec || rec.tenantId !== tenantId) throw new MaintenanceRecordNotFoundError();
    return this.withPlateNumber(rec);
  }

  async create(tenantId: string, data: CreateMaintenanceRecordInput) {
    const record: StoredMaintenanceRecord = {
      id: randomUUID(),
      tenantId,
      vehicleId: data.vehicleId,
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
    const existing = await this.findOne(tenantId, id);
    const updated = { ...existing, ...data, updatedAt: new Date() };
    await this.repo.save(updated);
    return updated;
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.repo.deleteById(id);
  }

  async transition(tenantId: string, id: string, status: MaintenanceRecordStatus) {
    const existing = await this.findOne(tenantId, id);
    const today = new Date().toISOString().slice(0, 10);
    const updated: StoredMaintenanceRecord = {
      ...existing,
      status,
      completedDate: status === "completed" ? today : existing.completedDate,
      updatedAt: new Date(),
    };
    await this.repo.save(updated);
    return updated;
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
