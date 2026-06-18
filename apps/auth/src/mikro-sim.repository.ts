import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  IotSimRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { SimFilters, SimRepository, StoredSim } from './sim.repository';

function toStored(record: IotSimRecord): StoredSim {
  return {
    id: record.id,
    iccid: record.iccid,
    imsi: record.imsi,
    msisdn: record.msisdn,
    carrier: record.carrier,
    plan: record.plan,
    status: record.status,
    tenantId: record.tenantId,
    deviceId: record.deviceId,
    deviceName: record.deviceName,
    deviceImei: record.deviceImei,
    deviceType: record.deviceType,
    vehicleId: record.vehicleId,
    suspensionReason: record.suspensionReason,
    notes: record.notes,
    dataUsageMb: Number(record.dataUsageMb),
    dataLimitMb: Number(record.dataLimitMb),
    smsUsage: record.smsUsage,
    smsLimit: record.smsLimit,
    monthlyCostNgn: Number(record.monthlyCostNgn),
    activationDate: record.activationDate,
    expiryDate: record.expiryDate,
    lastActivity: record.lastActivity,
    signalStrength: record.signalStrength,
    networkType: record.networkType,
    roaming: record.roaming,
    fonuSimId: record.fonuSimId,
    fonuStatus: record.fonuStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroSimRepository implements SimRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAll(filters?: SimFilters): Promise<{ items: StoredSim[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const conn = orm.em.getConnection();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push(`(iccid ilike ? or msisdn ilike ? or carrier ilike ?)`);
      params.push(q, q, q);
    }
    if (filters?.status) { conditions.push(`status = ?`); params.push(filters.status); }
    if (filters?.carrier) { conditions.push(`carrier = ?`); params.push(filters.carrier); }
    if (filters?.tenantId) { conditions.push(`tenant_id = ?`); params.push(filters.tenantId); }
    if (filters?.operators?.length) {
      conditions.push(`carrier = ANY(?)`);
      params.push(filters.operators);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const countRows = await conn.execute<Array<{ count: string }>>(
      `select count(*)::int as count from iot_sims ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;
    const rows = await conn.execute<IotSimRecord[]>(
      `select * from iot_sims ${where} order by created_at desc limit ? offset ?`,
      [...params, limit, offset],
    );

    return { items: rows.map((r) => toStored(r as unknown as IotSimRecord)), total };
  }

  async findById(id: string): Promise<StoredSim | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(IotSimRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(sim: StoredSim): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(IotSimRecord, { ...sim });
  }

  async delete(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(`delete from iot_sims where id = ?`, [id]);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ status: string; count: string }>>(
      'select status, count(*)::int as count from iot_sims group by status',
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async countByCarrier(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ carrier: string; count: string }>>(
      'select carrier, count(*)::int as count from iot_sims group by carrier',
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.carrier] = Number(row.count);
    return counts;
  }

  async countUnassigned(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      'select count(*)::int as count from iot_sims where tenant_id is null',
    );
    return Number(rows[0]?.count ?? 0);
  }
}
