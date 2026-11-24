import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { AuthEventRecord, getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  AuthEventFilters,
  AuthEventPage,
  AuthEventRepository,
  AuthEventStatus,
  AuthEventType,
  StoredAuthEvent,
} from './auth-event.repository';

function toStored(r: AuthEventRecord): StoredAuthEvent {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    email: r.email,
    eventType: r.eventType as StoredAuthEvent['eventType'],
    status: r.status as StoredAuthEvent['status'],
    failureReason: r.failureReason as StoredAuthEvent['failureReason'],
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    occurredAt: r.occurredAt,
  };
}

@Injectable()
export class MikroAuthEventRepository implements AuthEventRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(event: StoredAuthEvent): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(AuthEventRecord, event as unknown as AuthEventRecord);
  }

  private async search0(where: Record<string, unknown>, filters: AuthEventFilters): Promise<AuthEventPage> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();

    if (filters.tenantId !== undefined) where.tenantId = filters.tenantId;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.status) where.status = filters.status;
    if (filters.ipAddress) where.ipAddress = filters.ipAddress;
    if (filters.from || filters.to) {
      where.occurredAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;

    if (filters.search) {
      const q = `%${filters.search}%`;
      const conditions = ['(email ilike ? or ip_address ilike ? or tenant_id ilike ?)'];
      const params: unknown[] = [q, q, q];
      if (filters.tenantId !== undefined) { conditions.push('tenant_id = ?'); params.push(filters.tenantId); }
      if (filters.eventType) { conditions.push('event_type = ?'); params.push(filters.eventType); }
      if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
      if (filters.ipAddress) { conditions.push('ip_address = ?'); params.push(filters.ipAddress); }
      if (filters.from) { conditions.push('occurred_at >= ?'); params.push(filters.from); }
      if (filters.to) { conditions.push('occurred_at <= ?'); params.push(filters.to); }
      const whereClause = conditions.join(' and ');
      const rows = await orm.em.getConnection().execute<AuthEventRecord[]>(
        `select * from auth_events where ${whereClause} order by occurred_at desc limit ? offset ?`,
        [...params, limit, offset],
      );
      const countRows = await orm.em.getConnection().execute<Array<{ count: string }>>(
        `select count(*)::int as count from auth_events where ${whereClause}`,
        params,
      );
      return { items: rows.map((r) => toStored(r as unknown as AuthEventRecord)), total: Number(countRows[0]?.count ?? 0) };
    }

    const [records, total] = await em.findAndCount(AuthEventRecord, where, {
      orderBy: { occurredAt: 'desc' },
      limit,
      offset,
    });
    return { items: records.map(toStored), total };
  }

  async search(filters: AuthEventFilters): Promise<AuthEventPage> {
    return this.search0({}, filters);
  }

  async searchFailedLogins(filters: AuthEventFilters): Promise<AuthEventPage> {
    return this.search0({ eventType: 'login', status: 'failed' }, { ...filters, eventType: 'login', status: 'failed' });
  }

  async countFailuresFromIp(ipAddress: string, since: Date): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from auth_events where ip_address = ? and status = 'failed' and event_type = 'login' and (failure_reason is null or failure_reason not in ('account_locked', 'mfa_failed', 'rate_limited')) and occurred_at >= ?`,
      [ipAddress, since],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countSince(status: AuthEventStatus, eventType: AuthEventType, since: Date): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from auth_events where status = ? and event_type = ? and occurred_at >= ?`,
      [status, eventType, since],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `delete from auth_events where occurred_at < ? returning id`,
      [cutoff],
    );
    return rows.length;
  }
}
