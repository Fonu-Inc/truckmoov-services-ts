import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  AiRequestLogRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { AiProvider } from './ai-governance.repository';
import type {
  AiRequestFilters,
  AiRequestLogRepository,
  AiUsageByProvider,
  AiUsageByTenant,
  AiUsageTotals,
  StoredAiRequest,
} from './ai-request-log.repository';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

@Injectable()
export class MikroAiRequestLogRepository implements AiRequestLogRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async record(request: StoredAiRequest): Promise<void> {
    const em = await this.em();
    await em.upsert(AiRequestLogRecord, { ...request });
  }

  async findAll(filters?: AiRequestFilters): Promise<StoredAiRequest[]> {
    const em = await this.em();
    const where: Record<string, unknown> = {};

    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.provider) where.provider = filters.provider;
    if (filters?.model) where.model = filters.model;
    if (filters?.succeeded !== undefined) where.succeeded = filters.succeeded;
    if (filters?.from || filters?.to) {
      where.createdAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      where.$or = [
        { tenantId: { $ilike: term } },
        { provider: { $ilike: term } },
        { model: { $ilike: term } },
      ];
    }

    const records = await em.find(AiRequestLogRecord, where, {
      orderBy: { createdAt: 'desc' },
      limit: Math.min(filters?.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return records.map(toStored);
  }

  async totals(from?: Date, to?: Date): Promise<AiUsageTotals> {
    const { clause, params } = window(from, to);
    const rows = await this.query<{
      total_requests: number | string;
      total_tokens: number | string | null;
      succeeded: number | string;
      avg_latency: number | string | null;
    }>(
      `select count(*)::int as total_requests,
              coalesce(sum(total_tokens), 0)::bigint as total_tokens,
              count(*) filter (where succeeded)::int as succeeded,
              avg(latency_ms) as avg_latency
         from ai_request_log ${clause}`,
      params,
    );

    const row = rows[0];
    const totalRequests = Number(row?.total_requests ?? 0);
    return {
      totalRequests,
      totalTokens: Number(row?.total_tokens ?? 0),
      // Null rather than 100% when nothing has run: a success rate over zero
      // requests is not a fact about the platform.
      successRate:
        totalRequests === 0
          ? null
          : Math.round((Number(row?.succeeded ?? 0) / totalRequests) * 1000) / 10,
      averageLatencyMs: row?.avg_latency == null ? null : Math.round(Number(row.avg_latency)),
    };
  }

  async byProvider(from?: Date, to?: Date): Promise<AiUsageByProvider[]> {
    const { clause, params } = window(from, to);
    const rows = await this.query<{
      provider: string;
      requests: number | string;
      tokens: number | string | null;
    }>(
      `select provider, count(*)::int as requests, coalesce(sum(total_tokens), 0)::bigint as tokens
         from ai_request_log ${clause}
        group by provider
        order by tokens desc`,
      params,
    );

    return rows.map((row) => ({
      provider: row.provider,
      requests: Number(row.requests ?? 0),
      tokens: Number(row.tokens ?? 0),
    }));
  }

  async byTenant(from?: Date, to?: Date): Promise<AiUsageByTenant[]> {
    const { clause, params } = window(from, to);
    const rows = await this.query<{
      tenant_id: string;
      requests: number | string;
      tokens: number | string | null;
    }>(
      `select tenant_id, count(*)::int as requests, coalesce(sum(total_tokens), 0)::bigint as tokens
         from ai_request_log ${clause}
        group by tenant_id
        order by tokens desc`,
      params,
    );

    return rows.map((row) => {
      const requests = Number(row.requests ?? 0);
      const tokens = Number(row.tokens ?? 0);
      return {
        tenantId: row.tenant_id,
        requests,
        tokens,
        averageTokensPerRequest: requests === 0 ? 0 : Math.round(tokens / requests),
      };
    });
  }

  async tokensSince(tenantId: string, since: Date): Promise<number> {
    const rows = await this.query<{ tokens: number | string | null }>(
      `select coalesce(sum(total_tokens), 0)::bigint as tokens
         from ai_request_log
        where tenant_id = ? and created_at >= ?`,
      [tenantId, since],
    );
    return Number(rows[0]?.tokens ?? 0);
  }

  async countSince(tenantId: string, since: Date): Promise<number> {
    const rows = await this.query<{ requests: number | string }>(
      `select count(*)::int as requests
         from ai_request_log
        where tenant_id = ? and created_at >= ?`,
      [tenantId, since],
    );
    return Number(rows[0]?.requests ?? 0);
  }

  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.getConnection().execute<T[]>(sql, params);
  }

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }
}

function window(from?: Date, to?: Date): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (from) {
    conditions.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('created_at <= ?');
    params.push(to);
  }
  return {
    clause: conditions.length > 0 ? `where ${conditions.join(' and ')}` : '',
    params,
  };
}

function toStored(record: AiRequestLogRecord): StoredAiRequest {
  return {
    id: record.id,
    tenantId: record.tenantId,
    provider: record.provider as AiProvider,
    model: record.model,
    feature: record.feature,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
    latencyMs: record.latencyMs,
    succeeded: record.succeeded,
    errorMessage: record.errorMessage,
    promptBody: record.promptBody,
    responseBody: record.responseBody,
    createdAt: record.createdAt,
  };
}
