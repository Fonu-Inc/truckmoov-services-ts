import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { protocolNeedsPort } from "@shared/devices";
import { DeviceModelNotInCatalogError } from "../../domain/errors/device-installation.errors";
import {
  DEVICE_CATALOG_PORT,
  type DeviceCatalogModel,
  type DeviceCatalogPort,
} from "../../domain/ports/device-catalog.port";

export type InstallerGuide = {
  manufacturer: string;
  model: string;
  /** What the installer programs into the device. */
  configuration: {
    serverAddress: string;
    protocol: string;
    port: number | null;
    smsCommands: string[];
    instructions: string | null;
  };
  wiringNotes: string | null;
  diagramUrls: string[];
};

/**
 * Fitting instructions for one model.
 *
 * The server address is not catalogue data: it belongs to this deployment, not
 * to the tracker. The catalogue supplies everything that varies by model and
 * this joins the two, so an installer reads one set of settings rather than
 * combining them by hand.
 */
@Injectable()
export class GetInstallerGuideUseCase {
  constructor(
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(manufacturer: string, model: string): Promise<InstallerGuide> {
    const entry = await this.catalog.findModel(manufacturer, model);
    if (!entry) throw new DeviceModelNotInCatalogError(manufacturer, model);
    return this.toGuide(entry);
  }

  async listAll(): Promise<InstallerGuide[]> {
    const models = await this.catalog.findAll();
    return models.map((entry) => this.toGuide(entry));
  }

  private toGuide(entry: DeviceCatalogModel): InstallerGuide {
    return {
      manufacturer: entry.manufacturer,
      model: entry.model,
      configuration: {
        serverAddress: this.config.fleet.telemetryIngestHost,
        protocol: entry.protocol,
        port: protocolNeedsPort(entry.protocol) ? entry.defaultPort : null,
        smsCommands: entry.smsCommands,
        instructions: entry.configurationInstructions,
      },
      wiringNotes: entry.wiringNotes,
      diagramUrls: entry.diagramUrls,
    };
  }
}
