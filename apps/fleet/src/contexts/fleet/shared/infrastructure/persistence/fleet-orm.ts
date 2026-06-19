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

export class MaintenanceProfileRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  serviceType!: string;
  serviceLabel!: string;
  intervalType!: string;
  intervalDays!: number | null;
  intervalMonths!: number | null;
  intervalKm!: number | null;
  lastServiceDate!: string | null;
  lastServiceMileage!: number | null;
  currentMileage!: number | null;
  mileageSource!: string;
  nextDueDate!: string | null;
  nextDueMileage!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const MaintenanceProfileRecordSchema = new EntitySchema<MaintenanceProfileRecord>({
  class: MaintenanceProfileRecord,
  tableName: "fleet_maintenance_profiles",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255 },
    serviceType: { type: "string", length: 64 },
    serviceLabel: { type: "string", length: 255 },
    intervalType: { type: "string", length: 16 },
    intervalDays: { type: "integer", nullable: true },
    intervalMonths: { type: "integer", nullable: true },
    intervalKm: { type: "integer", nullable: true },
    lastServiceDate: { type: "string", length: 10, nullable: true },
    lastServiceMileage: { type: "integer", nullable: true },
    currentMileage: { type: "integer", nullable: true },
    mileageSource: { type: "string", length: 16 },
    nextDueDate: { type: "string", length: 10, nullable: true },
    nextDueMileage: { type: "integer", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class GeofenceZoneRecord {
  id!: string;
  tenantId!: string;
  name!: string;
  description!: string | null;
  coordinates!: [number, number][];
  radiusMeters!: number | null;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const GeofenceZoneRecordSchema = new EntitySchema<GeofenceZoneRecord>({
  class: GeofenceZoneRecord,
  tableName: "fleet_geofence_zones",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    name: { type: "string", length: 255 },
    description: { type: "text", nullable: true },
    coordinates: { type: "json" },
    radiusMeters: { type: "float", nullable: true },
    status: { type: "string", length: 16, defaultRaw: "'ACTIVE'" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class GeofenceAssignmentRecord {
  zoneId!: string;
  vehicleId!: string;
  tenantId!: string;
  createdAt!: Date;
}

export const GeofenceAssignmentRecordSchema = new EntitySchema<GeofenceAssignmentRecord>({
  class: GeofenceAssignmentRecord,
  tableName: "fleet_geofence_vehicle_assignments",
  properties: {
    zoneId: { type: "string", primary: true },
    vehicleId: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
  },
});

export class MaintenanceRecordOrmRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  maintenanceType!: string;
  description!: string | null;
  status!: string;
  priority!: string;
  scheduledDate!: string | null;
  completedDate!: string | null;
  cost!: number | null;
  currency!: string;
  technician!: string | null;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const MaintenanceRecordOrmSchema = new EntitySchema<MaintenanceRecordOrmRecord>({
  class: MaintenanceRecordOrmRecord,
  tableName: "fleet_maintenance_records",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255 },
    maintenanceType: { type: "string", length: 64 },
    description: { type: "text", nullable: true },
    status: { type: "string", length: 32, defaultRaw: "'scheduled'" },
    priority: { type: "string", length: 16, defaultRaw: "'medium'" },
    scheduledDate: { type: "string", length: 10, nullable: true },
    completedDate: { type: "string", length: 10, nullable: true },
    cost: { type: "decimal", nullable: true, precision: 12, scale: 2 },
    currency: { type: "string", length: 8, defaultRaw: "'NGN'" },
    technician: { type: "string", length: 255, nullable: true },
    notes: { type: "text", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class ComplianceDocumentRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string | null;
  documentType!: string;
  documentName!: string;
  issueDate!: string | null;
  expiryDate!: string | null;
  reminderDays!: number;
  fileUrl!: string | null;
  fileSize!: number | null;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ComplianceDocumentRecordSchema = new EntitySchema<ComplianceDocumentRecord>({
  class: ComplianceDocumentRecord,
  tableName: "fleet_compliance_documents",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255, nullable: true },
    documentType: { type: "string", length: 64 },
    documentName: { type: "string", length: 255 },
    issueDate: { type: "string", length: 10, nullable: true },
    expiryDate: { type: "string", length: 10, nullable: true },
    reminderDays: { type: "integer", defaultRaw: "30" },
    fileUrl: { type: "string", length: 1024, nullable: true },
    fileSize: { type: "integer", nullable: true },
    notes: { type: "text", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class FleetFinancialConfigRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  monthlyWagesNgn!: number | null;
  monthlyInsuranceNgn!: number | null;
  monthlyDepreciationNgn!: number | null;
  monthlyOtherNgn!: number | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const FleetFinancialConfigRecordSchema = new EntitySchema<FleetFinancialConfigRecord>({
  class: FleetFinancialConfigRecord,
  tableName: "fleet_financial_configs",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255 },
    monthlyWagesNgn: { type: "decimal", nullable: true, precision: 14, scale: 2 },
    monthlyInsuranceNgn: { type: "decimal", nullable: true, precision: 14, scale: 2 },
    monthlyDepreciationNgn: { type: "decimal", nullable: true, precision: 14, scale: 2 },
    monthlyOtherNgn: { type: "decimal", nullable: true, precision: 14, scale: 2 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [{ properties: ["tenantId", "vehicleId"], options: { unique: true } }],
});

let ormPromise: Promise<MikroORM> | null = null;

export async function getFleetOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = MikroORM.init({
    entities: [
      VehicleRecordSchema,
      DriverRecordSchema,
      JobRecordSchema,
      DeviceRecordSchema,
      MaintenanceProfileRecordSchema,
      GeofenceZoneRecordSchema,
      GeofenceAssignmentRecordSchema,
      MaintenanceRecordOrmSchema,
      ComplianceDocumentRecordSchema,
      FleetFinancialConfigRecordSchema,
    ],
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
