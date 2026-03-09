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
  createdAt!: Date;
  updatedAt!: Date;
}

export class DriverRecord {
  id!: string;
  name!: string;
  licenseNumber!: string;
  tenantId!: string;
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
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [{ properties: ["tenantId", "plateNumber"] }],
});

export const DriverRecordSchema = new EntitySchema<DriverRecord>({
  class: DriverRecord,
  tableName: "fleet_drivers",
  properties: {
    id: { type: "string", primary: true },
    name: { type: "string", length: 128 },
    licenseNumber: { type: "string", length: 64 },
    tenantId: { type: "string", length: 64 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
  indexes: [{ properties: ["tenantId", "licenseNumber"] }],
});

let ormPromise: Promise<MikroORM> | null = null;

export async function getFleetOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [VehicleRecordSchema, DriverRecordSchema],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
  }).then(async (orm) => {
    await orm.schema.updateSchema();
    return orm;
  });

  return ormPromise;
}
