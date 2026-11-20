import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";

export type QuotaResource =
  | "vehicles"
  | "drivers"
  | "devices"
  | "sims"
  | "storage_gb"
  | "geofences";

type Quota = number | "unlimited";

export type TenantEntitlements = {
  planCode: string;
  quotas: Partial<Record<QuotaResource, Quota>>;
  limitBehaviour: Partial<Record<QuotaResource, "block" | "warn" | "allow_and_bill">>;
};

type CachedEntitlements = {
  entitlements: TenantEntitlements | null;
  fetchedAtMs: number;
  /** True when auth could not be reached, so this is a fallback not an answer. */
  provisional?: boolean;
};

/** A failed lookup is remembered briefly, so an auth outage does not add a
 *  connect timeout to every create this service serves. */
const UNREACHABLE_BACKOFF_MS = 5_000;

/**
 * What a tenant's plan allows, read from auth.
 *
 * Auth owns plans and entitlements. Reading its tables directly from here would
 * mean two services deciding what a plan allows, and they would drift the first
 * time either changed. The cost is one HTTP call per tenant per cache window.
 */
@Injectable()
export class EntitlementReaderService {
  private readonly logger = new Logger(EntitlementReaderService.name);
  private readonly cache = new Map<string, CachedEntitlements>();

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async forTenant(tenantId: string): Promise<TenantEntitlements | null> {
    const cached = this.cache.get(tenantId);
    if (cached && !this.isStale(cached)) return cached.entitlements;

    const entitlements = await this.fetch(tenantId);
    if (entitlements === undefined) {
      // Auth unreachable. Falls back to the last answer, and to no limits for a
      // tenant never seen: refusing every create because auth is down would
      // take fleet out with it.
      this.cache.set(tenantId, {
        entitlements: cached?.entitlements ?? null,
        fetchedAtMs: Date.now(),
        provisional: true,
      });
      return cached?.entitlements ?? null;
    }

    this.cache.set(tenantId, { entitlements, fetchedAtMs: Date.now() });
    return entitlements;
  }

  private isStale(cached: CachedEntitlements): boolean {
    const ttlMs = cached.provisional
      ? UNREACHABLE_BACKOFF_MS
      : this.config.auth.tenantStatusCacheSeconds * 1000;
    return Date.now() - cached.fetchedAtMs >= ttlMs;
  }

  /** undefined means auth could not be reached, which is not the same as null. */
  private async fetch(tenantId: string): Promise<TenantEntitlements | null | undefined> {
    // Minted here rather than threaded from the request: a quota check runs
    // deep inside a use case, and passing a bearer token down through domain
    // commands to reach it would put a credential in the domain layer.
    const headers = this.caller.headers("auth", { tenantId, legacyRole: "OWNER_OPERATOR" });
    if (!headers) return undefined;

    try {
      const response = await axios.get<{ data?: TenantEntitlements | null }>(
        `${this.config.auth.serviceUrl}/auth/internal/usage/entitlements`,
        {
          headers,
          timeout: 2000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return undefined;
      return response.data?.data ?? null;
    } catch (error) {
      this.logger.warn(
        `entitlement_lookup_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return undefined;
    }
  }
}
