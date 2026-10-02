import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import { type ServiceCaller, SYSTEM_TENANT_ID, createServiceCaller } from '@shared/identity';

const QUARANTINE_NOT_FOUND_TEXT = 'unrecognised device not found';

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

export type GateMessageHour = { hourStart: string; count: number };

export type GateMessageRate = {
  countsSince: string;
  startedAt: string;
  lastHour: number;
  hours: GateMessageHour[];
};

export type QuarantinedDevice = {
  imei: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
  status: 'active' | 'dismissed' | 'blocked';
  handledAt?: string;
};

export type QuarantineAction = 'dismiss' | 'block' | 'unblock';

export type QuarantineActionResult =
  | { ok: true; status: QuarantinedDevice['status'] }
  | { ok: false; status: number; message: string };

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

  /** Null when tracking cannot be asked, which is not the same as no messages. */
  async messageRate(): Promise<GateMessageRate | null> {
    const headers = this.caller.headers('tracking', { tenantId: SYSTEM_TENANT_ID, legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;
    try {
      const response = await axios.get<{ data?: GateMessageRate }>(
        `${this.config.auth.trackingServiceUrl}/tracking/internal/messages/hourly`,
        { headers, timeout: 4000, validateStatus: () => true },
      );
      const report = response.data?.data;
      if (response.status !== 200 || !Array.isArray(report?.hours)) return null;
      return report;
    } catch (error) {
      this.logger.warn(`tracking_message_rate_read_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  /** Null when tracking cannot be asked, which is not the same as no unrecognised devices. */
  async quarantinedDevices(): Promise<QuarantinedDevice[] | null> {
    const headers = this.caller.headers('tracking', { tenantId: SYSTEM_TENANT_ID, legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;
    try {
      const response = await axios.get<{ data?: { devices?: QuarantinedDevice[] } }>(
        `${this.config.auth.trackingServiceUrl}/tracking/internal/quarantine`,
        { headers, timeout: 4000, validateStatus: () => true },
      );
      const devices = response.data?.data?.devices;
      if (response.status !== 200 || !Array.isArray(devices)) return null;
      return devices;
    } catch (error) {
      this.logger.warn(`tracking_quarantine_read_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  async actOnQuarantined(imei: string, action: QuarantineAction): Promise<QuarantineActionResult> {
    const headers = this.caller.headers('tracking', { tenantId: SYSTEM_TENANT_ID, legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return { ok: false, status: 503, message: 'Tracking cannot be reached right now' };
    try {
      const response = await axios.post<{ message?: string; data?: { status?: QuarantinedDevice['status'] } }>(
        `${this.config.auth.trackingServiceUrl}/tracking/internal/quarantine/${encodeURIComponent(imei)}/${action}`,
        undefined,
        { headers, timeout: 4000, validateStatus: () => true },
      );
      if (response.status === 200) return { ok: true, status: response.data?.data?.status ?? 'active' };
      if (response.status === 409) {
        return { ok: false, status: 409, message: response.data?.message ?? 'The device cannot take that action' };
      }
      if (response.status === 404 && response.data?.message?.trim().toLowerCase() === QUARANTINE_NOT_FOUND_TEXT) {
        return { ok: false, status: 404, message: 'That device is no longer in the list' };
      }
      return { ok: false, status: 503, message: 'Tracking could not update the device' };
    } catch (error) {
      this.logger.warn(`tracking_quarantine_action_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return { ok: false, status: 503, message: 'Tracking cannot be reached right now' };
    }
  }
}
