import type { AiProvider } from './ai-governance.repository';

export type StoredAiRequest = {
  id: string;
  tenantId: string;
  provider: AiProvider;
  model: string;
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  succeeded: boolean;
  errorMessage: string | null;
  /** Only populated while storePromptsAndResponses is on. Admin-only. */
  promptBody: string | null;
  responseBody: string | null;
  createdAt: Date;
};

export type AiRequestFilters = {
  tenantId?: string;
  provider?: string;
  model?: string;
  search?: string;
  succeeded?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type AiUsageTotals = {
  totalRequests: number;
  totalTokens: number;
  successRate: number | null;
  averageLatencyMs: number | null;
};

export type AiUsageByProvider = {
  provider: string;
  requests: number;
  tokens: number;
};

export type AiUsageByTenant = {
  tenantId: string;
  requests: number;
  tokens: number;
  averageTokensPerRequest: number;
};

export interface AiRequestLogRepository {
  record(request: StoredAiRequest): Promise<void>;
  findAll(filters?: AiRequestFilters): Promise<StoredAiRequest[]>;
  totals(from?: Date, to?: Date): Promise<AiUsageTotals>;
  byProvider(from?: Date, to?: Date): Promise<AiUsageByProvider[]>;
  byTenant(from?: Date, to?: Date): Promise<AiUsageByTenant[]>;
  /** Tokens a tenant has spent since a point in time, for the daily ceiling. */
  tokensSince(tenantId: string, since: Date): Promise<number>;
  /** Requests a tenant has made since a point in time, for the per-minute limit. */
  countSince(tenantId: string, since: Date): Promise<number>;
}

export const AI_REQUEST_LOG_REPOSITORY = Symbol('AI_REQUEST_LOG_REPOSITORY');
