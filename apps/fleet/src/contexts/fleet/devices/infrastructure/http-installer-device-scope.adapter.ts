import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";
import type {
  InstallerDeviceScopePort,
  InstallerScopeEntry,
} from "../domain/ports/installer-device-scope.port";

/** Asks auth, which owns installation jobs, which devices an installer may read. */
@Injectable()
export class HttpInstallerDeviceScopeAdapter implements InstallerDeviceScopePort {
  private readonly logger = new Logger(HttpInstallerDeviceScopeAdapter.name);
  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  private readonly inflight = new Map<string, Promise<InstallerScopeEntry[] | null>>();

  /** Concurrent calls for one user share a single request to auth. */
  forUser(userId: string): Promise<InstallerScopeEntry[] | null> {
    let pending = this.inflight.get(userId);
    if (!pending) {
      pending = this.fetchScope(userId).finally(() => this.inflight.delete(userId));
      this.inflight.set(userId, pending);
    }
    return pending;
  }

  private async fetchScope(userId: string): Promise<InstallerScopeEntry[] | null> {
    const headers = this.caller.headers("auth");
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: InstallerScopeEntry[] }>(
        `${this.config.auth.serviceUrl}/auth/internal/installers/${encodeURIComponent(userId)}/device-scope`,
        { headers, timeout: 3000, validateStatus: () => true },
      );
      if (response.status !== 200) return null;
      return response.data?.data ?? [];
    } catch (error) {
      this.logger.warn(
        `installer_device_scope_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return null;
    }
  }
}
