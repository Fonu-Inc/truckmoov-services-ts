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
  model!: string;
  tenantId!: string;
  status!: string;
  assignedDriverId?: string | null;
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
  licenseNumber!: string;
  tenantId!: string;
  status!: string;
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

export const VehicleRecordSchema = new EntitySchema<VehicleRecord>({
  class: VehicleRecord,
  tableName: "fleet_vehicles",
  properties: {
    id: { type: "string", primary: true },
    plateNumber: { type: "string", length: 64 },
    model: { type: "string", length: 128 },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    assignedDriverId: { type: "string", length: 64, nullable: true },
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
    { properties: ["assignedDriverId"] },
  ],
});

export const DriverRecordSchema = new EntitySchema<DriverRecord>({
  class: DriverRecord,
  tableName: "fleet_drivers",
  properties: {
    id: { type: "string", primary: true },
    name: { type: "string", length: 128 },
    licenseNumber: { type: "string", length: 64 },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
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

let ormPromise: Promise<MikroORM> | null = null;

export async function getFleetOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [VehicleRecordSchema, DriverRecordSchema, JobRecordSchema],
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
