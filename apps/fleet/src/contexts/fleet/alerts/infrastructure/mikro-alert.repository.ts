import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { AlertRecord, getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import { Alert, type AlertSeverity, type AlertStatus } from "../domain/alert.entity";
import type { AlertCount, AlertFilters, AlertRepository } from "../domain/alert.repository";

function toDomain(record: AlertRecord): Alert {
  return Alert.create({
    id: record.id,
    tenantId: record.tenantId,
    type: record.type,
    severity: record.severity as AlertSeverity,
    status: record.status as AlertStatus,
    vehicleId: record.vehicleId ?? null,
    jobId: record.jobId ?? null,
    details: record.details ?? {},
    triggeredAt: record.triggeredAt,
    acknowledgedAt: record.acknowledgedAt ?? null,
    resolvedAt: record.resolvedAt ?? null,
    escalatedAt: record.escalatedAt ?? null,
    acknowledgedBy: record.acknowledgedBy ?? null,
    resolvedBy: record.resolvedBy ?? null,
  });
}

function toRow(alert: Alert) {
  return { ...alert.toPrimitives() };
}

function toWhere(tenantId: string, filters?: AlertFilters) {
  return {
    tenantId,
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.type ? { type: filters.type } : {}),
    ...(filters?.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters?.vehicleIdIn ? { vehicleId: { $in: filters.vehicleIdIn } } : {}),
    ...(filters?.jobId ? { jobId: filters.jobId } : {}),
  };
}

@Injectable()
export class MikroAlertRepository implements AlertRepository {
  private readonly logger = new Logger(MikroAlertRepository.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(alert: Alert): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const { id, tenantId, ...fields } = toRow(alert);
    await em.upsert(AlertRecord, { id, tenantId, ...fields } as unknown as AlertRecord, {
      onConflictFields: ["id"],
      onConflictAction: "ignore",
    });
    const updated = await em.nativeUpdate(AlertRecord, { id, tenantId }, fields as unknown as Partial<AlertRecord>);
    if (updated === 0) {
      this.logger.warn(`alert ${id} id collision across tenants rejected for tenant ${tenantId}`);
    }
  }

  async findById(tenantId: string, id: string): Promise<Alert | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(AlertRecord, { id, tenantId });
    return record ? toDomain(record) : null;
  }

  async findAll(tenantId: string, filters?: AlertFilters): Promise<Alert[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(AlertRecord, toWhere(tenantId, filters), { orderBy: { triggeredAt: "desc" }, limit: filters?.limit });
    return records.map(toDomain);
  }

  async countBy(tenantId: string): Promise<AlertCount[]> {
    const orm = await getFleetOrm(this.config.db);
    const rows = await orm.em.fork().getConnection().execute<
      Array<{ status: AlertStatus; type: string; severity: AlertSeverity; count: number | string }>
    >(
      `select status, type, severity, count(*)::int as count
         from fleet_alerts
        where tenant_id = ?
        group by status, type, severity`,
      [tenantId],
    );
    return rows.map((row) => ({ status: row.status, type: row.type, severity: row.severity, count: Number(row.count) }));
  }

  async meanTimeToResolveMs(tenantId: string): Promise<number | null> {
    const orm = await getFleetOrm(this.config.db);
    const [row] = await orm.em.fork().getConnection().execute<Array<{ mean_ms: number | string | null }>>(
      `select avg(extract(epoch from resolved_at - triggered_at)) * 1000 as mean_ms
         from fleet_alerts
        where tenant_id = ? and resolved_at is not null`,
      [tenantId],
    );
    return row?.mean_ms == null ? null : Number(row.mean_ms);
  }

  async findOpenTriggeredBefore(cutoff: Date, limit: number): Promise<Alert[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(AlertRecord, { status: "open", triggeredAt: { $lt: cutoff } }, { orderBy: { triggeredAt: "asc" }, limit });
    return records.map(toDomain);
  }

  async escalateIfOpen(tenantId: string, id: string, at: Date): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    const updated = await orm.em
      .fork()
      .nativeUpdate(AlertRecord, { id, tenantId, status: "open" }, { status: "escalated", escalatedAt: at });
    return updated > 0;
  }
}
