import { Inject, Injectable } from "@nestjs/common";
import {
  DEVICE_CATALOG_PORT,
  type DeviceCatalogModel,
  type DeviceCatalogPort,
} from "../../domain/ports/device-catalog.port";

/**
 * The manufacturer and model dropdowns on Add Device and Request Device.
 *
 * Only supported models are offered. A tenant registering a deprecated or
 * blocked model produces a device the platform has decided it cannot configure,
 * and the failure surfaces much later at verification.
 */
@Injectable()
export class DeviceCatalogLookupUseCase {
  constructor(@Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort) {}

  async manufacturers(): Promise<{ manufacturers: string[] }> {
    const models = await this.supported();
    const names = new Set(models.map((model) => model.manufacturer));
    return { manufacturers: [...names].sort((a, b) => a.localeCompare(b)) };
  }

  async models(manufacturer?: string): Promise<{ models: Array<Record<string, unknown>> }> {
    const wanted = manufacturer?.trim().toLowerCase();
    const models = (await this.supported())
      .filter((model) => !wanted || model.manufacturer.toLowerCase() === wanted)
      .sort((a, b) => a.model.localeCompare(b.model));

    return {
      models: models.map((model) => ({
        manufacturer: model.manufacturer,
        model: model.model,
        protocol: model.protocol,
        defaultPort: model.defaultPort,
      })),
    };
  }

  // An unreachable catalogue returns nothing rather than failing the modal: the
  // operator can still type a model, and registration validates it again.
  private async supported(): Promise<DeviceCatalogModel[]> {
    const models = await this.catalog.findAll().catch(() => [] as DeviceCatalogModel[]);
    return models.filter((model) => model.status === "supported");
  }
}
