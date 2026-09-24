export const SYSTEM_DEVICE_PROTOCOL_TYPES = [
  'TCP',
  'HTTP',
  'MQTT',
  'UDP',
  'WEBSOCKET',
  'SDK',
] as const;
export const SYSTEM_DEVICE_CATALOG_STATUSES = [
  'supported',
  'deprecated',
  'blocked',
] as const;
export const SYSTEM_DEVICE_FEATURE_KEYS = ['obd2', 'fuel', 'sos'] as const;

export type SystemDeviceProtocolType =
  (typeof SYSTEM_DEVICE_PROTOCOL_TYPES)[number];
export type SystemDeviceCatalogStatus =
  (typeof SYSTEM_DEVICE_CATALOG_STATUSES)[number];
export type SystemDeviceFeatureKey =
  (typeof SYSTEM_DEVICE_FEATURE_KEYS)[number];

export type StoredSystemDeviceModel = {
  id: string;
  manufacturer: string;
  model: string;
  /** What the model is, e.g. "GPS Tracker". */
  deviceType: string | null;
  protocolType: SystemDeviceProtocolType;
  defaultPort: number | null;
  supportedFeatures: SystemDeviceFeatureKey[];
  status: SystemDeviceCatalogStatus;
  configurationInstructions: string | null;
  smsCommands: string[];
  wiringNotes: string | null;
  diagramUrls: string[];
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface DeviceModelCatalogRepository {
  save(model: StoredSystemDeviceModel): Promise<void>;
  findById(id: string): Promise<StoredSystemDeviceModel | null>;
  findByManufacturerAndModel(
    manufacturer: string,
    model: string,
  ): Promise<StoredSystemDeviceModel | null>;
  findAll(): Promise<StoredSystemDeviceModel[]>;
  deleteById(id: string): Promise<void>;
}

export const DEVICE_MODEL_CATALOG_REPOSITORY = Symbol(
  'DEVICE_MODEL_CATALOG_REPOSITORY',
);
