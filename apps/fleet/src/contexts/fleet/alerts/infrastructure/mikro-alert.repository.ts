import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { AlertRecord, getFleetOrm } from "../../shared/infrastructure/persistence/fleet-orm";
import { Alert, type AlertSeverity, type AlertStatus } from "../domain/alert.entity";
import type { AlertFilters, AlertRepository } from "../domain/alert.repository";

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
      .find(AlertRecord, toWhere(tenantId, filters), { orderBy: { createdAt: "desc" } });
    return records.map(toDomain);
  }

  async findOpenTriggeredBefore(cutoff: Date, limit: number): Promise<Alert[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(AlertRecord, { status: "open", triggeredAt: { $lt: cutoff } }, { orderBy: { triggeredAt: "asc" }, limit });
    return records.map(toDomain);
  }
}
