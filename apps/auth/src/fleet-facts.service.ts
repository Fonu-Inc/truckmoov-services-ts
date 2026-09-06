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
    const token = this.mintPlatformToken();
    if (!token) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{ data?: Record<string, unknown>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/${deviceId}/${action}`,
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
          message: response.data?.message ?? 'The device service refused the change',
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
