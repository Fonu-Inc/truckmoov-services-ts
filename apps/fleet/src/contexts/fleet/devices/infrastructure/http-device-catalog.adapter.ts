import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";
import { isDeviceProtocol } from "@shared/devices";
import type {
  DeviceCatalogModel,
  DeviceCatalogPort,
} from "../domain/ports/device-catalog.port";

type CatalogModelResponse = {
  manufacturer?: string;
  model?: string;
  protocolType?: string;
  defaultPort?: number | null;
  status?: string;
  configurationInstructions?: string | null;
  smsCommands?: string[] | null;
  wiringNotes?: string | null;
  diagramUrls?: string[] | null;
};

/**
 * Reads the device catalogue that auth owns.
 *
 * Cached because a model's protocol and port change about as often as the
 * model does, and the installer queue would otherwise call auth once per row.
 */
@Injectable()
export class HttpDeviceCatalogAdapter implements DeviceCatalogPort {
  private readonly logger = new Logger(HttpDeviceCatalogAdapter.name);
  private cache: { models: DeviceCatalogModel[]; expiresAt: number } | null = null;

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async findModel(manufacturer: string, model: string): Promise<DeviceCatalogModel | null> {
    const wantedManufacturer = manufacturer.trim().toLowerCase();
    const wantedModel = model.trim().toLowerCase();
    const models = await this.findAll();
    return (
      models.find(
        (entry) =>
          entry.manufacturer.toLowerCase() === wantedManufacturer
          && entry.model.toLowerCase() === wantedModel,
      ) ?? null
    );
  }

  async findAll(): Promise<DeviceCatalogModel[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.models;
    }

    const models = await this.fetchAll();
    if (models === null) {
      // Serve the stale copy rather than telling an installer that a model
      // they are holding does not exist.
      return this.cache?.models ?? [];
    }

    this.cache = {
      models,
      expiresAt: now + this.config.fleet.deviceCatalogCacheSeconds * 1000,
    };
    return models;
  }

  private async fetchAll(): Promise<DeviceCatalogModel[] | null> {
    const headers = this.caller.headers("auth", { tenantId: this.config.fleet.defaultTenant, legacyRole: "FLEET_ADMIN" });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: { models?: CatalogModelResponse[] } }>(
        `${this.config.auth.serviceUrl}/auth/internal/device-catalog/models`,
        {
          headers,
          timeout: 3000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      return (response.data?.data?.models ?? [])
        .map((entry) => this.toModel(entry))
        .filter((entry): entry is DeviceCatalogModel => entry !== null);
    } catch (error) {
      this.logger.warn(
        `device_catalog_fetch_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return null;
    }
  }

  private toModel(entry: CatalogModelResponse): DeviceCatalogModel | null {
    const protocol = entry.protocolType?.toUpperCase() ?? "";
    if (!entry.manufacturer || !entry.model || !isDeviceProtocol(protocol)) {
      return null;
    }

    return {
      manufacturer: entry.manufacturer,
      model: entry.model,
      protocol,
      defaultPort: entry.defaultPort ?? null,
      status: entry.status ?? "supported",
      configurationInstructions: entry.configurationInstructions ?? null,
      smsCommands: entry.smsCommands ?? [],
      wiringNotes: entry.wiringNotes ?? null,
      diagramUrls: entry.diagramUrls ?? [],
    };
  }
}
