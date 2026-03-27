import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
};

export class VehicleRecord {
  id!: string;
  plateNumber!: string;
  vin?: string | null;
  make?: string | null;
  model!: string;
  year?: number | null;
  type?: string | null;
  capacity?: number | null;
  tenantId!: string;
  status!: string;
  assignedDriverId?: string | null;
  gpsImei?: string | null;
  gpsManufacturer?: string | null;
  gpsModel?: string | null;
  gpsFirmwareVersion?: string | null;
  gpsDeviceId?: string | null;
  gpsProvider?: string | null;
  gpsSerialNumber?: string | null;
  gpsInstalledAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class DriverRecord {
  id!: string;
  name!: string;
  phone?: string | null;
  email?: string | null;
  licenseNumber!: string;
  licenseExpiryDate?: string | null;
  tenantId!: string;
  status!: string;
  communicationPreference?: string | null;
  assignedVehicleId?: string | null;
  whatsappNumber?: string | null;
  smsNumber?: string | null;
  voiceNumber?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class JobRecord {
  jobId!: string;
  tenantId!: string;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class DeviceRecord {
  id!: string;
  imei!: string;
  manufacturer!: string;
  model!: string;
  firmwareVersion!: string;
  tenantId!: string;
  status!: string;
  lifecycleStatus!: string;
  vehicleId?: string | null;
  signalStrength?: number | null;
  batteryLevel?: number | null;
  lastSeen?: Date | null;
  assignedAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VehicleRecordSchema = new EntitySchema<VehicleRecord>({
  class: VehicleRecord,
  tableName: "fleet_vehicles",
  properties: {
    id: { type: "string", primary: true },
    plateNumber: { type: "string", length: 64 },
    vin: { type: "string", length: 17, nullable: true },
    make: { type: "string", length: 64, nullable: true },
    model: { type: "string", length: 128 },
    year: { type: "integer", nullable: true },
    type: { type: "string", length: 32, nullable: true },
    capacity: { type: "float", nullable: true },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    assignedDriverId: { type: "string", length: 64, nullable: true },
    gpsImei: { type: "string", length: 32, nullable: true },
    gpsManufacturer: { type: "string", length: 64, nullable: true },
    gpsModel: { type: "string", length: 64, nullable: true },
    gpsFirmwareVersion: { type: "string", length: 32, nullable: true },
    gpsDeviceId: { type: "string", length: 128, nullable: true },
    gpsProvider: { type: "string", length: 128, nullable: true },
    gpsSerialNumber: { type: "string", length: 128, nullable: true },
    gpsInstalledAt: { type: "datetime", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [
    { properties: ["tenantId", "plateNumber"] },
    { properties: ["tenantId", "status"] },
    { properties: ["tenantId", "vin"] },
    { properties: ["assignedDriverId"] },
  ],
});

export const DriverRecordSchema = new EntitySchema<DriverRecord>({
  class: DriverRecord,
  tableName: "fleet_drivers",
  properties: {
    id: { type: "string", primary: true },
    name: { type: "string", length: 128 },
    phone: { type: "string", length: 32, nullable: true },
    email: { type: "string", length: 128, nullable: true },
    licenseNumber: { type: "string", length: 64 },
    licenseExpiryDate: { type: "string", length: 32, nullable: true },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    communicationPreference: { type: "string", length: 16, nullable: true },
    assignedVehicleId: { type: "string", length: 64, nullable: true },
    whatsappNumber: { type: "string", length: 32, nullable: true },
    smsNumber: { type: "string", length: 32, nullable: true },
    voiceNumber: { type: "string", length: 32, nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [
    { properties: ["tenantId", "licenseNumber"] },
    { properties: ["tenantId", "status"] },
    { properties: ["assignedVehicleId"] },
  ],
});

export const JobRecordSchema = new EntitySchema<JobRecord>({
  class: JobRecord,
  tableName: "fleet_jobs",
  properties: {
    jobId: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 32 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [{ properties: ["tenantId", "status"] }],
});

export const DeviceRecordSchema = new EntitySchema<DeviceRecord>({
  class: DeviceRecord,
  tableName: "fleet_devices",
  properties: {
    id: { type: "string", primary: true },
    imei: { type: "string", length: 32 },
    manufacturer: { type: "string", length: 64 },
    model: { type: "string", length: 64 },
    firmwareVersion: { type: "string", length: 32 },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 32, defaultRaw: "'registered'" },
    lifecycleStatus: { type: "string", length: 32, defaultRaw: "'registered'" },
    vehicleId: { type: "string", length: 64, nullable: true },
    signalStrength: { type: "integer", nullable: true },
    batteryLevel: { type: "integer", nullable: true },
    lastSeen: { type: "datetime", nullable: true },
    assignedAt: { type: "datetime", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [
    { properties: ["tenantId", "imei"], options: { unique: true } },
    { properties: ["tenantId", "status"] },
    { properties: ["tenantId", "lifecycleStatus"] },
    { properties: ["vehicleId"] },
  ],
});

let ormPromise: Promise<MikroORM> | null = null;

export async function getFleetOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [VehicleRecordSchema, DriverRecordSchema, JobRecordSchema, DeviceRecordSchema],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
    migrations: {
      path: process.env.NODE_ENV === "production"
        ? "dist/apps/fleet/src/migrations"
        : "apps/fleet/src/migrations",
      tableName: "mikro_migrations_fleet",
      safe: true,
      glob: "!(*.d).{js,ts}",
    },
  }).then(async (orm) => {
    await orm.getMigrator().up();
    return orm;
  });

  return ormPromise;
}
