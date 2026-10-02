import { Injectable } from '@nestjs/common';
import type {
  AiRequestFilters,
  AiRequestLogRepository,
  AiUsageByProvider,
  AiUsageByTenant,
  AiUsageTotals,
  StoredAiRequest,
} from './ai-request-log.repository';

@Injectable()
export class InMemoryAiRequestLogRepository implements AiRequestLogRepository {
  private readonly store: StoredAiRequest[] = [];

  async record(request: StoredAiRequest): Promise<void> {
    this.store.push({ ...request });
  }

  async findAll(filters?: AiRequestFilters): Promise<StoredAiRequest[]> {
    let results = [...this.store];

    if (filters?.tenantId !== undefined) results = results.filter((r) => r.tenantId === filters.tenantId);
    if (filters?.provider) results = results.filter((r) => r.provider === filters.provider);
    if (filters?.model) results = results.filter((r) => r.model === filters.model);
    if (filters?.succeeded !== undefined) {
      results = results.filter((r) => r.succeeded === filters.succeeded);
    }
    if (filters?.from) results = results.filter((r) => r.createdAt >= filters.from!);
    if (filters?.to) results = results.filter((r) => r.createdAt <= filters.to!);
    if (filters?.search?.trim()) {
      const term = filters.search.trim().toLowerCase();
      results = results.filter((r) =>
        [r.tenantId, r.provider, r.model].some((value) => value.toLowerCase().includes(term)),
      );
    }

    return results
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filters?.limit ?? 100);
  }

  async totals(from?: Date, to?: Date): Promise<AiUsageTotals> {
    const rows = this.inWindow(from, to);
    if (rows.length === 0) {
      return { totalRequests: 0, totalTokens: 0, successRate: null, averageLatencyMs: null };
    }

    const succeeded = rows.filter((row) => row.succeeded).length;
    return {
      totalRequests: rows.length,
      totalTokens: rows.reduce((total, row) => total + row.totalTokens, 0),
      successRate: Math.round((succeeded / rows.length) * 1000) / 10,
      averageLatencyMs: Math.round(
        rows.reduce((total, row) => total + row.latencyMs, 0) / rows.length,
      ),
    };
  }

  async byProvider(from?: Date, to?: Date): Promise<AiUsageByProvider[]> {
    const grouped = new Map<string, AiUsageByProvider>();
    for (const row of this.inWindow(from, to)) {
      const current = grouped.get(row.provider) ?? { provider: row.provider, requests: 0, tokens: 0 };
      current.requests += 1;
      current.tokens += row.totalTokens;
      grouped.set(row.provider, current);
    }
    return [...grouped.values()].sort((a, b) => b.tokens - a.tokens);
  }

  async byTenant(from?: Date, to?: Date): Promise<AiUsageByTenant[]> {
    const grouped = new Map<string, { requests: number; tokens: number }>();
    for (const row of this.inWindow(from, to)) {
      const current = grouped.get(row.tenantId) ?? { requests: 0, tokens: 0 };
      current.requests += 1;
      current.tokens += row.totalTokens;
      grouped.set(row.tenantId, current);
    }

    return [...grouped.entries()]
      .map(([tenantId, totals]) => ({
        tenantId,
        requests: totals.requests,
        tokens: totals.tokens,
        averageTokensPerRequest:
          totals.requests === 0 ? 0 : Math.round(totals.tokens / totals.requests),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  async tokensSince(tenantId: string, since: Date): Promise<number> {
    return this.store
      .filter((row) => row.tenantId === tenantId && row.createdAt >= since)
      .reduce((total, row) => total + row.totalTokens, 0);
  }

  async countSince(tenantId: string, since: Date): Promise<number> {
    return this.store.filter((row) => row.tenantId === tenantId && row.createdAt >= since).length;
  }

  private inWindow(from?: Date, to?: Date): StoredAiRequest[] {
    return this.store.filter(
      (row) => (!from || row.createdAt >= from) && (!to || row.createdAt <= to),
    );
  }
}
