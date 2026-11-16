import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import { createServiceCaller, type ServiceCaller } from '@shared/identity';

/** null: the whole tenant. A list: only these vehicles. undefined: fleet could not say. */
export type LiveScope = string[] | null | undefined;

/** Asks fleet which vehicles an owner operator's socket may carry. */
@Injectable()
export class LiveScopeClient {
  private readonly caller: ServiceCaller;
  private readonly fleetUrl: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.caller = createServiceCaller(config, 'realtime');
    this.fleetUrl = config.auth.fleetServiceUrl;
  }

  async vehicleIdsFor(tenantId: string, userId: string): Promise<LiveScope> {
    const headers = this.caller.headers('fleet', { tenantId });
    if (!headers) return undefined;
    try {
      const response = await axios.get<{ data?: { vehicleIds?: unknown } }>(
        `${this.fleetUrl}/fleet/internal/live-scope/${encodeURIComponent(userId)}`,
        { headers, timeout: 3000, validateStatus: () => true },
      );
      const ids = response.data?.data?.vehicleIds;
      if (response.status !== 200 || ids === undefined) return undefined;
      if (ids === null) return null;
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : undefined;
    } catch {
      return undefined;
    }
  }
}
