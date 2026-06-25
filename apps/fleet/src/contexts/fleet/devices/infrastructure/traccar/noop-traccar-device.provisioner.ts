import { Injectable } from "@nestjs/common";
import type {
  TraccarDeviceProvisioner,
  TraccarRegisterResult,
} from "../../domain/ports/traccar-device.port";

/**
 * Used when no Traccar base URL is configured (local / in-memory / test). Device
 * creation proceeds untouched and provision status stays "pending".
 */
@Injectable()
export class NoopTraccarDeviceProvisioner implements TraccarDeviceProvisioner {
  async register(): Promise<TraccarRegisterResult | null> {
    return null;
  }

  async deregister(): Promise<void> {
    return;
  }
}
