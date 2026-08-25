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

  private mintServiceToken(tenantId: string): string | null {
    const secret = this.config.auth.jwtSecret;
    if (!secret || !tenantId) return null;

    const payload = JSON.stringify({
      sub: 'auth-service',
      email: 'auth-service@truckmoov.local',
      role: 'FLEET_ADMIN',
      tenantId,
      exp: Math.floor(Date.now() / 1000) + 5 * 60,
    });
    const encoded = Buffer.from(payload).toString('base64url');
    return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
  }
}
