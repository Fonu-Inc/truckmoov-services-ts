import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";

type CachedStatus = {
  active: boolean;
  checkedAtMs: number;
  /** True when auth could not be reached, so this is a fallback and not an answer. */
  provisional?: boolean;
};

/**
 * How long a failed lookup is remembered. Without this, an auth outage makes
 * every single request pay a fresh connect timeout, turning one service being
 * down into fleet-wide latency.
 */
const UNREACHABLE_BACKOFF_MS = 5_000;

/**
 * Answers whether a tenant is still active, for a service that cannot see the
 * tenant record.
 *
 * Fleet verifies the access token by HMAC and never reads the user, so a token
 * minted before a suspension stays cryptographically valid to it. Two
 * independent mechanisms close that window, and each covers the other's gap:
 *
 *  - the suspension event marks the tenant immediately, but a pod that started
 *    after the event was published never saw it;
 *  - the query to auth is authoritative for any tenant not in the cache, which
 *    is exactly the case a freshly started pod is in.
 *
 * Neither alone is sufficient. The event alone loses its state on restart; the
 * query alone leaves a suspension unnoticed for the length of the cache TTL.
 */
@Injectable()
export class TenantStatusService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantStatusService.name);
  private readonly cache = new Map<string, CachedStatus>();

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bus.subscribe("tm.*.tenant.suspended", async (event) => {
        this.logger.warn(`tenant_suspended:${event.tenant_id}`);
        this.cache.set(event.tenant_id, { active: false, checkedAtMs: Date.now() });
      });
      await this.bus.subscribe("tm.*.tenant.reinstated", async (event) => {
        this.logger.log(`tenant_reinstated:${event.tenant_id}`);
        // Evicted rather than marked active, so the next request confirms the
        // reinstatement with auth instead of trusting the event on its own.
        this.cache.delete(event.tenant_id);
      });
    } catch (error) {
      // Without the subscription the cache TTL is the only mechanism left, so
      // this is worth a loud line rather than a silent degradation.
      this.logger.error(
        `tenant_status_subscribe_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  async isActive(tenantId: string, accessToken: string): Promise<boolean> {
    // Nothing to enforce without a real auth service to ask. This is the
    // in-memory backend used by tests and local runs, where consulting auth
    // would only buy a connect timeout on every request.
    if (this.config.persistence.backend !== "mikro-orm") return true;

    const cached = this.cache.get(tenantId);
    if (cached && !this.isStale(cached)) {
      return cached.active;
    }

    // A suspension already known from an event is not re-queried while it is
    // fresh, which keeps a suspended tenant's traffic off the auth service.
    const active = await this.askAuth(accessToken);
    if (active === null) {
      // Auth unreachable. Falls back to the last known answer, and only admits
      // an unknown tenant. Failing closed here would take fleet down with auth.
      const fallback = cached?.active ?? true;
      this.cache.set(tenantId, {
        active: fallback,
        checkedAtMs: Date.now(),
        provisional: true,
      });
      return fallback;
    }

    this.cache.set(tenantId, { active, checkedAtMs: Date.now() });
    return active;
  }

  private isStale(cached: CachedStatus): boolean {
    const ttlMs = cached.provisional
      ? UNREACHABLE_BACKOFF_MS
      : this.config.auth.tenantStatusCacheSeconds * 1000;
    return Date.now() - cached.checkedAtMs >= ttlMs;
  }

  /** Returns null when auth could not be reached, which is not the same as inactive. */
  private async askAuth(accessToken: string): Promise<boolean | null> {
    try {
      const response = await axios.get<{ data?: { active?: boolean } }>(
        `${this.config.auth.serviceUrl}/auth/tenant-status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 2000,
          validateStatus: () => true,
        },
      );

      if (response.status === 401) return false;
      if (response.status !== 200) return null;
      return response.data?.data?.active !== false;
    } catch (error) {
      this.logger.warn(
        `tenant_status_lookup_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return null;
    }
  }
}
