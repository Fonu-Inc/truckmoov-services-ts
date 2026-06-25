import { Inject, Injectable } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type {
  TraccarDeviceProvisioner,
  TraccarRegisterInput,
  TraccarRegisterResult,
} from "../../domain/ports/traccar-device.port";

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Talks to Traccar's REST API over HTTP Basic auth using the Doppler-sourced
 * service-admin credential. Registration is idempotent: a duplicate uniqueId is
 * reconciled by looking the existing device up rather than failing.
 */
@Injectable()
export class HttpTraccarDeviceProvisioner implements TraccarDeviceProvisioner {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.baseUrl = config.traccar.baseUrl.replace(/\/+$/, "");
    const token = Buffer.from(
      `${config.traccar.adminEmail}:${config.traccar.adminPassword}`,
    ).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async register(input: TraccarRegisterInput): Promise<TraccarRegisterResult | null> {
    const created = await axios.post(
      `${this.baseUrl}/api/devices`,
      { name: input.name, uniqueId: input.imei },
      {
        headers: { "Content-Type": "application/json", Authorization: this.authHeader },
        validateStatus: () => true,
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    if (created.status >= 200 && created.status < 300 && created.data?.id != null) {
      return { traccarDeviceId: String(created.data.id) };
    }

    // A duplicate uniqueId returns 4xx — reconcile against the existing record.
    const existingId = await this.findByUniqueId(input.imei);
    if (existingId) {
      return { traccarDeviceId: existingId };
    }

    throw new Error(`traccar device registration failed (status ${created.status})`);
  }

  async deregister(traccarDeviceId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/api/devices/${traccarDeviceId}`, {
      headers: { Authorization: this.authHeader },
      validateStatus: () => true,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  private async findByUniqueId(imei: string): Promise<string | null> {
    const res = await axios.get(`${this.baseUrl}/api/devices`, {
      params: { uniqueId: imei },
      headers: { Authorization: this.authHeader },
      validateStatus: () => true,
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (res.status >= 200 && res.status < 300 && Array.isArray(res.data) && res.data.length > 0) {
      return String(res.data[0].id);
    }
    return null;
  }
}
