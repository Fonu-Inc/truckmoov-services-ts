import type { DeviceProtocol } from "../entities/device.entity";

/** What a device model says about how it reports and how it is fitted. */
export type DeviceCatalogModel = {
  manufacturer: string;
  model: string;
  /** What the model is, e.g. "GPS Tracker". */
  deviceType: string | null;
  protocol: DeviceProtocol;
  defaultPort: number | null;
  status: string;
  configurationInstructions: string | null;
  smsCommands: string[];
  wiringNotes: string | null;
  diagramUrls: string[];
};

export interface DeviceCatalogPort {
  /**
   * Returns null when the model is not in the catalogue or the catalogue
   * cannot be reached. The caller must not guess a protocol: programming a
   * tracker with the wrong one produces a device that never reports and no
   * indication of why.
   */
  findModel(manufacturer: string, model: string): Promise<DeviceCatalogModel | null>;
  findAll(): Promise<DeviceCatalogModel[]>;
}

export const DEVICE_CATALOG_PORT = Symbol("DEVICE_CATALOG_PORT");
