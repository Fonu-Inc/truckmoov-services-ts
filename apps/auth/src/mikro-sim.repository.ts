import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  IotSimRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { SimRepository, StoredSim } from './sim.repository';

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

  async findAll(filters?: {
    status?: string;
    carrier?: string;
    tenantId?: string;
    search?: string;
  }): Promise<StoredSim[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.carrier) where.carrier = filters.carrier;
    if (filters?.tenantId) where.tenantId = filters.tenantId;

    if (filters?.search) {
      const q = `%${filters.search}%`;
      const rows = await orm.em.getConnection().execute<IotSimRecord[]>(
        `select * from iot_sims where (iccid ilike ? or msisdn ilike ?) ${filters.status ? 'and status = ?' : ''} ${filters.carrier ? 'and carrier = ?' : ''} ${filters.tenantId ? 'and tenant_id = ?' : ''} order by created_at desc`,
        [
          q,
          q,
          ...(filters.status ? [filters.status] : []),
          ...(filters.carrier ? [filters.carrier] : []),
          ...(filters.tenantId ? [filters.tenantId] : []),
        ],
      );
      return rows.map((r) => toStored(r as unknown as IotSimRecord));
    }

    const records = await em.find(IotSimRecord, where, {
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toStored);
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

  async countByStatus(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .getConnection()
      .execute<Array<{ status: string; count: string }>>(
        'select status, count(*)::int as count from iot_sims group by status',
      );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async countByCarrier(): Promise<Record<string, number>> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .getConnection()
      .execute<Array<{ carrier: string; count: string }>>(
        'select carrier, count(*)::int as count from iot_sims group by carrier',
      );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.carrier] = Number(row.count);
    return counts;
  }

  async countUnassigned(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .getConnection()
      .execute<Array<{ count: string }>>(
        'select count(*)::int as count from iot_sims where tenant_id is null',
      );
    return Number(rows[0]?.count ?? 0);
  }
}
