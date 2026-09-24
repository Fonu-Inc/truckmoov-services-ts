import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { FuelRecord } from "../domain/entities/fuel-record.entity";
import type { FuelRecordFilters, FuelRecordRepository } from "../domain/repositories/fuel-record.repository";
import { FleetFuelRecordRecord, getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import { inclusiveEnd } from "../../../../utils/date-window";

@Injectable()
export class MikroFuelRecordRepository implements FuelRecordRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(record: FuelRecord): Promise<void> {
    const em = await this.em();
    await em.upsert(FleetFuelRecordRecord, toRow(record));
  }

  async findById(id: string, tenantId: string): Promise<FuelRecord | null> {
    const em = await this.em();
    const row = await em.findOne(FleetFuelRecordRecord, { id, tenantId });
    return row ? toDomain(row) : null;
  }

  async findAll(filters?: FuelRecordFilters): Promise<FuelRecord[]> {
    const em = await this.em();
    const rows = await em.find(FleetFuelRecordRecord, fuelRecordWhere(filters), {
      orderBy: { recordedAt: "desc" },
    });
    return rows.map(toDomain);
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}

export function fuelRecordWhere(filters: FuelRecordFilters = {}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.vehicleId) where.vehicleId = filters.vehicleId;
  if (filters.driverId) where.driverId = filters.driverId;
  if (filters.station) where.station = { $ilike: `%${escapeLike(filters.station)}%` };

  const recordedAt: Record<string, Date> = {};
  const to = inclusiveEnd(filters.to);
  if (filters.from) recordedAt.$gte = new Date(filters.from);
  if (to) recordedAt.$lte = new Date(to);
  if (Object.keys(recordedAt).length > 0) where.recordedAt = recordedAt;
  return where;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function toRow(record: FuelRecord): FleetFuelRecordRecord {
  const p = record.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    vehicleId: p.vehicleId,
    driverId: p.driverId,
    vehicleType: p.vehicleType,
    fuelType: p.fuelType ?? null,
    liters: p.liters,
    pricePerLiter: p.pricePerLiter,
    totalCost: p.totalCost,
    station: p.station,
    odometer: p.odometer,
    recordedAt: new Date(p.recordedAt),
    recordedBy: p.recordedBy,
    deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
    auditTrail: p.auditTrail,
    updatedAt: new Date(),
  } as FleetFuelRecordRecord;
}

export function toDomain(row: FleetFuelRecordRecord): FuelRecord {
  return FuelRecord.create({
    id: row.id,
    tenantId: row.tenantId,
    vehicleId: row.vehicleId,
    driverId: row.driverId ?? null,
    vehicleType: row.vehicleType ?? null,
    fuelType: row.fuelType ?? null,
    liters: Number(row.liters),
    pricePerLiter: Number(row.pricePerLiter),
    totalCost: Number(row.totalCost),
    station: row.station ?? null,
    odometer: row.odometer === null || row.odometer === undefined ? null : Number(row.odometer),
    recordedAt: new Date(row.recordedAt).toISOString(),
    recordedBy: row.recordedBy,
    deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    auditTrail: row.auditTrail ?? [],
  });
}
