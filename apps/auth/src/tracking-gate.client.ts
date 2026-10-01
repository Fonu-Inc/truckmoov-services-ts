import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import { type ServiceCaller, SYSTEM_TENANT_ID, createServiceCaller } from '@shared/identity';

export type GateBlockedDevice = {
  deviceId: string;
  imei: string;
  tenantId: string;
  lastSeenAt: string;
  droppedToday: number;
  droppedTotal: number;
  blockedReason: 'tenant' | 'device';
};

export type GateReport = {
  countsSince: string;
  startedAt: string;
  devices: GateBlockedDevice[];
};

@Injectable()
export class TrackingGateClient {
  private readonly logger = new Logger(TrackingGateClient.name);
  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, 'auth');
  }

  /** Null when the gate cannot be asked, which is not the same as nothing being blocked. */
  async blockedDevices(): Promise<GateReport | null> {
    const headers = this.caller.headers('tracking', { tenantId: SYSTEM_TENANT_ID, legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;
    try {
      const response = await axios.get<{ data?: GateReport }>(
        `${this.config.auth.trackingServiceUrl}/tracking/internal/gate/blocked-devices`,
        { headers, timeout: 4000, validateStatus: () => true },
      );
      const report = response.data?.data;
      if (response.status !== 200 || !Array.isArray(report?.devices)) return null;
      return report;
    } catch (error) {
      this.logger.warn(`tracking_gate_read_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }
}
