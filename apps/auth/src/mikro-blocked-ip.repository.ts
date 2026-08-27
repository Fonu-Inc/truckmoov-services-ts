import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { BlockedIpRecord, getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { BlockedIpFilters, BlockedIpPage, BlockedIpRepository, StoredBlockedIp } from './blocked-ip.repository';

function toStored(r: BlockedIpRecord): StoredBlockedIp {
  return {
    id: r.id,
    ipAddress: r.ipAddress,
    reason: r.reason,
    blockType: r.blockType as StoredBlockedIp['blockType'],
    blockedAt: r.blockedAt,
    expiresAt: r.expiresAt,
    blockedBy: r.blockedBy,
    unblockedAt: r.unblockedAt,
    unblockedBy: r.unblockedBy,
  };
}

@Injectable()
export class MikroBlockedIpRepository implements BlockedIpRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(block: StoredBlockedIp): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(BlockedIpRecord, block as unknown as BlockedIpRecord);
  }

  async findById(id: string): Promise<StoredBlockedIp | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(BlockedIpRecord, { id });
    return record ? toStored(record) : null;
  }

  async findActiveByIp(ipAddress: string): Promise<StoredBlockedIp | null> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<BlockedIpRecord[]>(
      `select * from blocked_ips where ip_address = ? and unblocked_at is null and (expires_at is null or expires_at > now()) limit 1`,
      [ipAddress],
    );
    return rows[0] ? toStored(rows[0] as unknown as BlockedIpRecord) : null;
  }

  async search(filters: BlockedIpFilters): Promise<BlockedIpPage> {
    const orm = await getAuthOrm(this.config.db);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.activeOnly) conditions.push('unblocked_at is null and (expires_at is null or expires_at > now())');
    if (filters.search) {
      conditions.push('(ip_address ilike ? or reason ilike ?)');
      const q = `%${filters.search}%`;
      params.push(q, q);
    }
    const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    const rows = await orm.em.getConnection().execute<BlockedIpRecord[]>(
      `select * from blocked_ips ${whereClause} order by blocked_at desc limit ? offset ?`,
      [...params, limit, offset],
    );
    const countRows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from blocked_ips ${whereClause}`,
      params,
    );
    return {
      items: rows.map((r) => toStored(r as unknown as BlockedIpRecord)),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async countActive(): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from blocked_ips where unblocked_at is null and (expires_at is null or expires_at > now())`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findExpiring(before: Date, limit: number): Promise<StoredBlockedIp[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<BlockedIpRecord[]>(
      `select * from blocked_ips where unblocked_at is null and expires_at is not null and expires_at <= ? limit ?`,
      [before, limit],
    );
    return rows.map((r) => toStored(r as unknown as BlockedIpRecord));
  }
}
