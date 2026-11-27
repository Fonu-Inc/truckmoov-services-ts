import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { SYSTEM_TENANT_ID } from "@shared/identity";
import { Device } from "../../domain/entities/device.entity";
import { DEVICE_CATALOG_PORT, type DeviceCatalogPort } from "../../domain/ports/device-catalog.port";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";
import {
  MAX_REPORTED_REJECTIONS,
  STOCK_IMPORT_BATCH_SIZE,
  catalogKey,
  chunk,
  stockRowProblem,
  type StockImportRejection,
  type StockImportRow,
} from "../../domain/platform-stock-import";

export type ImportPlatformStockResult = {
  total: number;
  created: number;
  skippedExisting: number;
  rejected: StockImportRejection[];
  rejectedTotal: number;
};

/** Registers devices the platform itself holds, ready to be allocated to tenants. */
@Injectable()
export class ImportPlatformStockUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
  ) {}

  async execute(rows: StockImportRow[]): Promise<ImportPlatformStockResult> {
    const models = await this.catalog.findAll().catch(() => []);
    if (models.length === 0) throw new ServiceUnavailableException("The device catalog could not be read");
    const canonical = new Map(models.map((entry) => [catalogKey(entry.manufacturer, entry.model), entry]));
    const catalogKeys = new Set(canonical.keys());

    const rejected: StockImportRejection[] = [];
    let rejectedTotal = 0;
    const reject = (line: number, imei: string, reason: string) => {
      rejectedTotal += 1;
      if (rejected.length < MAX_REPORTED_REJECTIONS) rejected.push({ line, imei, reason });
    };

    const seen = new Set<string>();
    const valid: Array<{ line: number; row: StockImportRow }> = [];
    const spelled = (row: StockImportRow) => canonical.get(catalogKey(row.manufacturer, row.model))!;
    rows.forEach((row, index) => {
      const line = index + 1;
      const imei = typeof row?.imei === "string" ? row.imei.trim() : "";
      const problem = row && typeof row === "object" ? stockRowProblem(row, catalogKeys) : "row is not an object";
      if (problem) return reject(line, imei, problem);
      if (seen.has(imei)) return reject(line, imei, "IMEI appears more than once in this import");
      seen.add(imei);
      valid.push({ line, row });
    });

    let created = 0;
    let skippedExisting = 0;
    for (const batch of chunk(valid, STOCK_IMPORT_BATCH_SIZE)) {
      const existing = await this.devices.findExistingImeis(batch.map(({ row }) => row.imei.trim()));
      const fresh = batch.filter(({ row }) => !existing.has(row.imei.trim()));
      skippedExisting += batch.length - fresh.length;
      if (fresh.length === 0) continue;

      const inserted = await this.devices.insertMany(fresh.map(({ row }) => this.toStock(row, spelled(row))));
      created += inserted;
      skippedExisting += fresh.length - inserted;
    }

    return { total: rows.length, created, skippedExisting, rejected, rejectedTotal };
  }

  private toStock(row: StockImportRow, entry: { manufacturer: string; model: string }): Device {
    return Device.create({
      id: this.runtime.generateId(),
      imei: row.imei.trim(),
      name: row.name?.trim() || null,
      manufacturer: entry.manufacturer.trim(),
      model: entry.model.trim(),
      firmwareVersion: "1.0.0",
      tenantId: SYSTEM_TENANT_ID,
      lifecycleStatus: "assignable",
      vehicleId: null,
      signalStrength: null,
      batteryLevel: null,
      lastSeen: null,
      assignedAt: null,
    });
  }
}
