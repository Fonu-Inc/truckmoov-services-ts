import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  WAYBILL_STATUSES,
  Waybill,
  isWaybillSource,
  isWaybillStatus,
  type ExtractedFields,
  type WaybillStatus,
} from "../../domain/entities/waybill.entity";
import type {
  WaybillFilters,
  WaybillPage,
  WaybillRepository,
} from "../../domain/repositories/waybill.repository";
import {
  WaybillRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroWaybillRepository implements WaybillRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(waybill: Waybill): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(WaybillRecord, {
      id: waybill.id,
      tenantId: waybill.tenantId,
      source: waybill.source,
      status: waybill.status,
      waybillNumber: waybill.waybillNumber,
      origin: waybill.origin,
      destination: waybill.destination,
      vehicleRegistration: waybill.vehicleRegistration,
      customerName: waybill.customerName,
      priceKobo: waybill.priceKobo,
      pricingRuleId: waybill.pricingRuleId,
      weight: waybill.weight,
      weightUnit: waybill.weightUnit,
      waybillDate: waybill.waybillDate ? new Date(waybill.waybillDate) : null,
      imageKey: waybill.imageKey,
      imageSha256: waybill.imageSha256,
      imageBytes: waybill.imageBytes,
      extractedFields: waybill.extractedFields,
      extractionError: waybill.extractionError,
      invoiceId: waybill.invoiceId,
      replyChannel: waybill.replyChannel,
      replyAddress: waybill.replyAddress,
      createdAt: new Date(waybill.createdAt),
      updatedAt: new Date(waybill.updatedAt),
    });
  }

  async findById(id: string, tenantId: string): Promise<Waybill | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(WaybillRecord, { id, tenantId });
    return record ? toDomain(record) : null;
  }

  async findByNumber(waybillNumber: string, tenantId: string): Promise<Waybill | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em
      .fork()
      .findOne(WaybillRecord, { waybillNumber: waybillNumber.trim(), tenantId });
    return record ? toDomain(record) : null;
  }

  async search(filters: WaybillFilters): Promise<WaybillPage> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();

    const where: Record<string, unknown> = { tenantId: filters.tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.customerName) where.customerName = filters.customerName;
    if (filters.dateFrom || filters.dateTo) {
      where.waybillDate = {
        ...(filters.dateFrom ? { $gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { $lte: new Date(filters.dateTo) } : {}),
      };
    }

    const query = filters.query?.trim();
    if (query) {
      const like = { $ilike: `%${query}%` };
      where.$or = [
        { waybillNumber: like },
        { destination: like },
        { vehicleRegistration: like },
        { customerName: like },
      ];
    }

    // Counted in the database rather than by measuring the page. The screen
    // shows a total alongside a page, and the two must agree.
    const [records, total] = await em.findAndCount(WaybillRecord, where, {
      orderBy: { createdAt: "desc" },
      limit: filters.limit,
      offset: filters.offset,
    });

    return { items: records.map(toDomain), total };
  }

  async findPendingCapturedBefore(cutoff: Date, limit: number): Promise<Waybill[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em.fork().find(
      WaybillRecord,
      { status: "pending", createdAt: { $lte: cutoff } },
      { orderBy: { createdAt: "asc" }, limit },
    );
    return records.map(toDomain);
  }

  async countByStatus(tenantId: string): Promise<Record<WaybillStatus, number>> {
    const orm = await getFleetOrm(this.config.db);
    // Grouped in SQL. A tenant's waybill count is unbounded, and counting them
    // in memory would fail first on the tenant the figures matter most for.
    const rows = await orm.em.getConnection().execute<Array<{ status: string; total: string }>>(
      `select status, count(*) as total
         from fleet_waybills
        where tenant_id = ?
        group by status`,
      [tenantId],
    );

    const counts = Object.fromEntries(
      WAYBILL_STATUSES.map((status) => [status, 0]),
    ) as Record<WaybillStatus, number>;
    for (const row of rows) {
      if (isWaybillStatus(row.status)) counts[row.status] = Number(row.total);
    }
    return counts;
  }
}

function toDomain(record: WaybillRecord): Waybill {
  return Waybill.create({
    id: record.id,
    tenantId: record.tenantId,
    source: isWaybillSource(record.source) ? record.source : "upload",
    status: isWaybillStatus(record.status) ? record.status : "pending",
    waybillNumber: record.waybillNumber ?? null,
    origin: record.origin ?? null,
    destination: record.destination ?? null,
    vehicleRegistration: record.vehicleRegistration ?? null,
    customerName: record.customerName ?? null,
    priceKobo: toNumberOrNull(record.priceKobo),
    pricingRuleId: record.pricingRuleId ?? null,
    weight: toNumberOrNull(record.weight),
    weightUnit: record.weightUnit ?? null,
    waybillDate: record.waybillDate ? toDateOnly(record.waybillDate) : null,
    imageKey: record.imageKey ?? null,
    imageSha256: record.imageSha256 ?? null,
    imageBytes: toNumberOrNull(record.imageBytes),
    extractedFields: (record.extractedFields as ExtractedFields) ?? {},
    extractionError: record.extractionError ?? null,
    invoiceId: record.invoiceId ?? null,
    replyChannel: (record.replyChannel as "whatsapp" | "email" | null) ?? null,
    replyAddress: record.replyAddress ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

/** bigint and numeric come back as strings from the driver. */
function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The waybill date is a calendar date, so it must not pick up a timezone shift. */
function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
