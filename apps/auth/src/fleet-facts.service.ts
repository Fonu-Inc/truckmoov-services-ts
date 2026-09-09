import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';

/**
 * Facts auth needs from fleet to make a decision.
 *
 * Fleet owns vehicles, so fleet counts them. Reading fleet's tables from here
 * would put the same number in two places and let them disagree, which is the
 * coupling this platform has been removing.
 */
/**
 * Identifiers the platform will put into a URL path.
 *
 * Every id below arrives from a request — a path parameter or a request body —
 * and is interpolated into a call carrying a cross-tenant platform-admin
 * token. Without this, `../../` in an id walks out of the intended route and
 * reaches any internal fleet endpoint with those privileges.
 *
 * Validation and encoding both, deliberately. Encoding alone would neutralise
 * traversal, but a value outside this shape is not an id we issued and there
 * is nothing useful to do with it but refuse.
 */
const SAFE_PATH_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Nest's unmatched-route fallback names the path it could not match, and this
 * service calls fleet on an internal URL the caller never sees. Forwarding that
 * message verbatim hands the service topology to anyone who sends a bad id.
 */
const ROUTE_FALLBACK = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /i;

function safeDownstreamMessage(raw: string | undefined, fallback: string): string {
  if (!raw || ROUTE_FALLBACK.test(raw) || raw.includes('/fleet/internal')) return fallback;
  return raw;
}

function isSafePathId(value: string): boolean {
  return SAFE_PATH_ID.test(value);
}

@Injectable()
export class FleetFactsService {
  private readonly logger = new Logger(FleetFactsService.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  /**
   * Active vehicles a tenant holds right now.
   *
   * Returns null when fleet cannot be reached. The caller must treat that as
   * "unknown" and refuse to decide, rather than as zero: approving a promotion
   * on a count of zero would approve one that has no justification.
   */
  async activeVehicleCount(tenantId: string): Promise<number | null> {
    const token = this.mintServiceToken(tenantId);
    if (!token) return null;

    try {
      const response = await axios.get<{ data?: { activeVehicles?: number } }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/vehicle-count`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 3000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      const count = response.data?.data?.activeVehicles;
      return typeof count === 'number' ? count : null;
    } catch (error) {
      this.logger.warn(
        `fleet_vehicle_count_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Suspends or reinstates a device fleet owns.
   *
   * The rule — releasing the vehicle, remembering where the device was —
   * belongs to fleet, so the platform asks rather than writing the columns
   * itself. A copy of that rule here would be a second definition of what
   * suspension means.
   */
  async setDeviceSuspension(
    deviceId: string,
    action: 'suspend' | 'reinstate',
    reason?: string | null,
  ): Promise<{ ok: true; device: Record<string, unknown> } | { ok: false; status: number; message: string }> {
    if (!isSafePathId(deviceId)) {
      return { ok: false, status: 404, message: 'Device not found' };
    }

    const token = this.mintPlatformToken();
    if (!token) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{ data?: Record<string, unknown>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(action)}`,
        action === 'suspend' ? { reason: reason ?? null } : {},
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          status: response.status,
          message: safeDownstreamMessage(
            response.data?.message,
            'The device service refused the change',
          ),
        };
      }
      return { ok: true, device: response.data?.data ?? {} };
    } catch (error) {
      this.logger.warn(
        `fleet_device_${action}_failed:${deviceId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /**
   * A tenant's vehicles, drivers or devices for the platform admin drawer.
   *
   * Fleet owns them, so fleet lists them. Returns null when fleet cannot be
   * reached, which the caller shows as unavailable rather than as an empty
   * fleet — those mean very different things on a review screen.
   */
  async tenantResource(
    tenantId: string,
    resource: 'vehicles' | 'drivers' | 'devices',
  ): Promise<{ total: number; items: Array<Record<string, unknown>> } | null> {
    if (!isSafePathId(tenantId)) return null;

    const token = this.mintPlatformToken();
    if (!token) return null;

    try {
      const response = await axios.get<{
        data?: { total?: number; items?: Array<Record<string, unknown>> };
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/${encodeURIComponent(resource)}`,
        {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 4000,
        validateStatus: () => true,
      });

      if (response.status !== 200) return null;
      return {
        total: response.data?.data?.total ?? 0,
        items: response.data?.data?.items ?? [],
      };
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_${resource}_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * A snapshot of one record, for a support ticket's auto-attached context.
   *
   * Null when fleet cannot be reached or the record does not exist. The
   * caller treats that as "no context" and lets the ticket be raised anyway —
   * refusing to log a fault because the record could not be read is exactly
   * backwards when the fault may be that the record is unreachable.
   */
  async contextSnapshot(
    tenantId: string,
    resource: 'device' | 'vehicle',
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    // Refused rather than encoded away: an id outside this shape is not one we
    // issued, and the caller treats a null as "no context", which is correct.
    if (!isSafePathId(tenantId) || !isSafePathId(recordId)) return null;

    const token = this.mintPlatformToken();
    if (!token) return null;

    try {
      const response = await axios.get<{ data?: Record<string, unknown> }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/context/${encodeURIComponent(resource)}/${encodeURIComponent(recordId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 4000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      return response.data?.data ?? null;
    } catch (error) {
      this.logger.warn(
        `fleet_context_snapshot_failed:${tenantId}:${resource}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private mintServiceToken(tenantId: string): string | null {
    return this.mintToken('FLEET_ADMIN', tenantId);
  }

  /**
   * A platform-role token. The device suspension route is cross-tenant, so it
   * carries the platform role rather than a tenant's own.
   */
  private mintPlatformToken(): string | null {
    return this.mintToken('PLATFORM_ADMIN', 'system');
  }

  private mintToken(role: string, tenantId: string): string | null {
    const secret = this.config.auth.jwtSecret;
    if (!secret || !tenantId) return null;

    const payload = JSON.stringify({
      sub: 'auth-service',
      email: 'auth-service@truckmoov.local',
      role,
      tenantId,
      exp: Math.floor(Date.now() / 1000) + 5 * 60,
    });
    const encoded = Buffer.from(payload).toString('base64url');
    return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
  }
}
