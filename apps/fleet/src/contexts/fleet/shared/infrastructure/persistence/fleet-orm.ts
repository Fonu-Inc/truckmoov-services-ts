import { EntitySchema } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { retryDbConnect, runMigrationsExclusively } from "@shared/db";

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
  poolMin?: number;
  poolMax?: number;
};

export class VehicleRecord {
  id!: string;
  plateNumber!: string;
  vin?: string | null;
  make?: string | null;
  model!: string;
  year?: number | null;
  type?: string | null;
  fuelType?: string | null;
  capacity?: number | null;
  capacityUnit?: string | null;
  tenantId!: string;
  status!: string;
  assignedDriverId?: string | null;
  ownerOperatorId?: string | null;
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
  performanceScore?: number | null;
  performanceJobsScored?: number | null;
  performanceScoredAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class DeviceRecord {
  id!: string;
  imei!: string;
  name?: string | null;
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
  protocol?: string | null;
  port?: number | null;
  reportedProtocol?: string | null;
  configuredAt?: Date | null;
  verificationStatus?: string | null;
  verificationDeadline?: Date | null;
  verificationError?: string | null;
  verifiedAt?: Date | null;
  preSuspensionLifecycleStatus?: string | null;
  suspendedAt?: Date | null;
  suspensionReason?: string | null;
  suspendedBy?: string | null;
  traccarDeviceId?: string | null;
  provisionStatus?: string | null;
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
    fuelType: { type: "string", length: 16, nullable: true },
    capacity: { type: "float", nullable: true },
    capacityUnit: { fieldName: "capacity_unit", type: "string", length: 16, nullable: true },
    tenantId: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    assignedDriverId: { type: "string", length: 64, nullable: true },
    ownerOperatorId: { type: "string", length: 64, nullable: true },
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
    { properties: ["ownerOperatorId"] },
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
    performanceScore: { fieldName: "performance_score", type: "number", nullable: true },
    performanceJobsScored: { fieldName: "performance_jobs_scored", type: "number", nullable: true },
    performanceScoredAt: { fieldName: "performance_scored_at", type: "datetime", nullable: true },
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

export const DeviceRecordSchema = new EntitySchema<DeviceRecord>({
  class: DeviceRecord,
  tableName: "fleet_devices",
  properties: {
    id: { type: "string", primary: true },
    imei: { type: "string", length: 32 },
    name: { type: "string", length: 120, nullable: true },
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
    protocol: { type: "string", length: 16, nullable: true },
    port: { type: "integer", nullable: true },
    reportedProtocol: { type: "string", length: 32, nullable: true },
    configuredAt: { type: "datetime", nullable: true },
    verificationStatus: { type: "string", length: 16, nullable: true },
    verificationDeadline: { type: "datetime", nullable: true },
    verificationError: { type: "text", nullable: true },
    verifiedAt: { type: "datetime", nullable: true },
    preSuspensionLifecycleStatus: { type: "string", length: 32, nullable: true },
    suspendedAt: { type: "datetime", nullable: true },
    suspensionReason: { type: "string", length: 500, nullable: true },
    suspendedBy: { type: "string", length: 16, nullable: true },
    traccarDeviceId: { type: "string", length: 64, nullable: true },
    provisionStatus: { type: "string", length: 16, nullable: true, defaultRaw: "'pending'" },
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
    { properties: ["tenantId", "verificationStatus"] },
    { properties: ["verificationDeadline"] },
    { properties: ["vehicleId"] },
  ],
});

/**
 * Why a device failed verification, and what it actually sent.
 *
 * The raw payload is kept as text and never parsed on the way in. A device
 * that is misconfigured sends bytes we cannot read, and those bytes are the
 * only evidence of what is wrong with it.
 */
export class DeviceVerificationFailureRecord {
  id!: string;
  tenantId!: string;
  deviceId!: string;
  imei!: string;
  reason!: string;
  detail?: string | null;
  rawPayload?: string | null;
  sourceAddress?: string | null;
  createdAt!: Date;
}

export const DeviceVerificationFailureRecordSchema =
  new EntitySchema<DeviceVerificationFailureRecord>({
    class: DeviceVerificationFailureRecord,
    tableName: "fleet_device_verification_failures",
    properties: {
      id: { type: "string", primary: true },
      tenantId: { type: "string", length: 64 },
      deviceId: { type: "string", length: 64 },
      imei: { type: "string", length: 32 },
      reason: { type: "string", length: 64 },
      detail: { type: "text", nullable: true },
      rawPayload: { type: "text", nullable: true },
      sourceAddress: { type: "string", length: 64, nullable: true },
      createdAt: { type: "datetime", defaultRaw: "now()" },
    },
    indexes: [
      { properties: ["tenantId", "deviceId"] },
      { properties: ["createdAt"] },
    ],
  });

export class WaybillRecord {
  id!: string;
  tenantId!: string;
  source!: string;
  status!: string;
  waybillNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicleRegistration?: string | null;
  customerName?: string | null;
  priceKobo?: string | number | null;
  pricingRuleId?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  waybillDate?: Date | null;
  imageKey?: string | null;
  imageSha256?: string | null;
  imageBytes?: string | number | null;
  driverId?: string | null;
  extractedFields!: Record<string, unknown>;
  extractionError?: string | null;
  invoiceId?: string | null;
  replyChannel?: string | null;
  replyAddress?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const WaybillRecordSchema = new EntitySchema<WaybillRecord>({
  class: WaybillRecord,
  tableName: "fleet_waybills",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    source: { type: "string", length: 16 },
    status: { type: "string", length: 16, defaultRaw: "'pending'" },
    waybillNumber: { type: "string", length: 64, nullable: true },
    origin: { type: "string", length: 255, nullable: true },
    destination: { type: "string", length: 255, nullable: true },
    vehicleRegistration: { type: "string", length: 64, nullable: true },
    customerName: { type: "string", length: 255, nullable: true },
    priceKobo: { type: "bigint", nullable: true },
    pricingRuleId: { type: "string", length: 64, nullable: true },
    weight: { type: "decimal", precision: 14, scale: 3, nullable: true },
    weightUnit: { type: "string", length: 32, nullable: true },
    waybillDate: { type: "date", nullable: true },
    imageKey: { type: "string", length: 512, nullable: true },
    imageSha256: { type: "string", length: 64, nullable: true },
    imageBytes: { type: "bigint", nullable: true },
    driverId: { type: "string", length: 64, nullable: true },
    extractedFields: { type: "json", defaultRaw: "'{}'" },
    extractionError: { type: "text", nullable: true },
    invoiceId: { type: "string", length: 64, nullable: true },
    replyChannel: { type: "string", length: 16, nullable: true },
    replyAddress: { type: "string", length: 255, nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [
    { properties: ["tenantId", "status"] },
    { properties: ["tenantId", "waybillDate"] },
    { properties: ["invoiceId"] },
    { properties: ["driverId"] },
  ],
});

export class PricingRuleRecord {
  id!: string;
  tenantId!: string;
  name!: string;
  origin?: string | null;
  destination!: string;
  destinationAliases!: string[];
  mode!: string;
  currency!: string;
  flatPriceKobo?: string | number | null;
  pricePerUnitKobo?: string | number | null;
  unitType?: string | null;
  minimumChargeKobo?: string | number | null;
  vehicleType?: string | null;
  customerName?: string | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const PricingRuleRecordSchema = new EntitySchema<PricingRuleRecord>({
  class: PricingRuleRecord,
  tableName: "fleet_pricing_rules",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    name: { type: "string", length: 255 },
    origin: { type: "string", length: 255, nullable: true },
    destination: { type: "string", length: 255 },
    destinationAliases: { type: "json", defaultRaw: "'[]'" },
    mode: { type: "string", length: 16 },
    currency: { type: "string", length: 8, defaultRaw: "'NGN'" },
    flatPriceKobo: { type: "bigint", nullable: true },
    pricePerUnitKobo: { type: "bigint", nullable: true },
    unitType: { type: "string", length: 32, nullable: true },
    minimumChargeKobo: { type: "bigint", nullable: true },
    vehicleType: { type: "string", length: 64, nullable: true },
    customerName: { type: "string", length: 255, nullable: true },
    effectiveFrom: { type: "date", nullable: true },
    effectiveTo: { type: "date", nullable: true },
    active: { type: "boolean", default: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [{ properties: ["tenantId", "active"] }],
});

export class InvoiceSettingsRecord {
  tenantId!: string;
  companyName!: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxEnabled!: boolean;
  taxRateBasisPoints!: number;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  invoicePrefix!: string;
  paymentTermsDays!: number;
  defaultNotes?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const InvoiceSettingsRecordSchema = new EntitySchema<InvoiceSettingsRecord>({
  class: InvoiceSettingsRecord,
  tableName: "fleet_invoice_settings",
  properties: {
    tenantId: { type: "string", length: 64, primary: true },
    companyName: { type: "string", length: 255 },
    address: { type: "text", nullable: true },
    phone: { type: "string", length: 32, nullable: true },
    email: { type: "string", length: 255, nullable: true },
    taxEnabled: { type: "boolean", default: false },
    taxRateBasisPoints: { type: "integer", default: 0 },
    bankName: { type: "string", length: 255, nullable: true },
    accountName: { type: "string", length: 255, nullable: true },
    accountNumber: { type: "string", length: 32, nullable: true },
    invoicePrefix: { type: "string", length: 16, defaultRaw: "'INV'" },
    paymentTermsDays: { type: "integer", default: 30 },
    defaultNotes: { type: "text", nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class CustomerInvoiceRecord {
  id!: string;
  tenantId!: string;
  invoiceNumber!: string;
  status!: string;
  customerName!: string;
  origin?: string | null;
  destination?: string | null;
  vehicleRegistration?: string | null;
  subtotalKobo!: string | number;
  taxKobo!: string | number;
  totalKobo!: string | number;
  currency!: string;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  sentTo?: string | null;
  sentAt?: Date | null;
  paidAt?: Date | null;
  paymentReference?: string | null;
  settingsSnapshot!: Record<string, unknown>;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CustomerInvoiceRecordSchema = new EntitySchema<CustomerInvoiceRecord>({
  class: CustomerInvoiceRecord,
  tableName: "fleet_customer_invoices",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    invoiceNumber: { type: "string", length: 64 },
    status: { type: "string", length: 16, defaultRaw: "'draft'" },
    customerName: { type: "string", length: 255 },
    origin: { type: "string", length: 255, nullable: true },
    destination: { type: "string", length: 255, nullable: true },
    vehicleRegistration: { type: "string", length: 64, nullable: true },
    subtotalKobo: { type: "bigint" },
    taxKobo: { type: "bigint", default: 0 },
    totalKobo: { type: "bigint" },
    currency: { type: "string", length: 8, defaultRaw: "'NGN'" },
    issuedAt: { type: "datetime", nullable: true },
    dueAt: { type: "date", nullable: true },
    sentTo: { type: "string", length: 255, nullable: true },
    sentAt: { type: "datetime", nullable: true },
    paidAt: { type: "datetime", nullable: true },
    paymentReference: { type: "string", length: 128, nullable: true },
    settingsSnapshot: { type: "json", defaultRaw: "'{}'" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [
    { properties: ["tenantId", "invoiceNumber"], options: { unique: true } },
    { properties: ["tenantId", "status"] },
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
  zoneType!: string;
  coordinates!: [number, number][];
  centerLatitude!: number | null;
  centerLongitude!: number | null;
  radiusMeters!: number | null;
  status!: string;
  category!: string;
  entryAlertsEnabled!: boolean;
  exitAlertsEnabled!: boolean;
  dwellAlertsEnabled!: boolean;
  dwellMinutes!: number | null;
  speedLimitEnabled!: boolean;
  speedLimitKph!: number | null;
  scheduleEnabled!: boolean;
  scheduleTimezone!: string | null;
  scheduleDays!: string[];
  scheduleStartTime!: string | null;
  scheduleEndTime!: string | null;
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
    zoneType: { type: "string", length: 64, defaultRaw: "'general'" },
    coordinates: { type: "json" },
    centerLatitude: { type: "float", nullable: true },
    centerLongitude: { type: "float", nullable: true },
    radiusMeters: { type: "float", nullable: true },
    status: { type: "string", length: 16, defaultRaw: "'ACTIVE'" },
    category: { type: "string", length: 64, defaultRaw: "'general'" },
    entryAlertsEnabled: { type: "boolean", defaultRaw: "true" },
    exitAlertsEnabled: { type: "boolean", defaultRaw: "true" },
    dwellAlertsEnabled: { type: "boolean", defaultRaw: "false" },
    dwellMinutes: { type: "integer", nullable: true },
    speedLimitEnabled: { type: "boolean", defaultRaw: "false" },
    speedLimitKph: { type: "float", nullable: true },
    scheduleEnabled: { type: "boolean", defaultRaw: "false" },
    scheduleTimezone: { type: "string", length: 64, nullable: true },
    scheduleDays: { type: "json" },
    scheduleStartTime: { type: "string", length: 8, nullable: true },
    scheduleEndTime: { type: "string", length: 8, nullable: true },
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

export class DriverBehaviorEventRecord {
  id!: string;
  tenantId!: string;
  driverId!: string;
  vehicleId!: string | null;
  type!: string;
  severity!: string;
  speedKph!: number | null;
  latitude!: number | null;
  longitude!: number | null;
  occurredAt!: Date;
  createdAt!: Date;
}

export const DriverBehaviorEventRecordSchema = new EntitySchema<DriverBehaviorEventRecord>({
  class: DriverBehaviorEventRecord,
  tableName: "fleet_driver_behavior_events",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { fieldName: "tenant_id", type: "string", length: 64, index: true },
    driverId: { fieldName: "driver_id", type: "string", length: 64, index: true },
    vehicleId: { fieldName: "vehicle_id", type: "string", length: 64, nullable: true },
    type: { type: "string", length: 32 },
    severity: { type: "string", length: 16 },
    speedKph: { fieldName: "speed_kph", type: "float", nullable: true },
    latitude: { type: "float", nullable: true },
    longitude: { type: "float", nullable: true },
    occurredAt: { fieldName: "occurred_at", type: "datetime", index: true },
    createdAt: { fieldName: "created_at", type: "datetime", defaultRaw: "now()" },
  },
});

export class DriverFatigueAnalysisRecord {
  id!: string;
  tenantId!: string;
  driverId!: string;
  score!: number;
  riskLevel!: string;
  drivingMinutes!: number;
  restCompliance!: number | null;
  indicators!: unknown[];
  recommendations!: unknown[];
  analysis!: string;
  dataQuality!: string;
  analyzedAt!: Date;
}

export const DriverFatigueAnalysisRecordSchema = new EntitySchema<DriverFatigueAnalysisRecord>({
  class: DriverFatigueAnalysisRecord,
  tableName: "fleet_driver_fatigue_analyses",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { fieldName: "tenant_id", type: "string", length: 64, index: true },
    driverId: { fieldName: "driver_id", type: "string", length: 64, index: true },
    score: { type: "number" },
    riskLevel: { fieldName: "risk_level", type: "string", length: 16 },
    drivingMinutes: { fieldName: "driving_minutes", type: "number", default: 0 },
    restCompliance: { fieldName: "rest_compliance", type: "number", nullable: true },
    indicators: { type: "json", default: "[]" },
    recommendations: { type: "json", default: "[]" },
    analysis: { type: "text", default: "" },
    dataQuality: { fieldName: "data_quality", type: "string", length: 16, default: "partial" },
    analyzedAt: { fieldName: "analyzed_at", type: "datetime", index: true },
  },
});

export class GeofenceAlertReadRecord {
  id!: string;
  tenantId!: string;
  alertId!: string;
  readBy!: string;
  readAt!: Date;
}

export const GeofenceAlertReadRecordSchema = new EntitySchema<GeofenceAlertReadRecord>({
  class: GeofenceAlertReadRecord,
  tableName: "fleet_geofence_alert_reads",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { fieldName: "tenant_id", type: "string", length: 64, index: true },
    alertId: { fieldName: "alert_id", type: "string", length: 64, index: true },
    readBy: { fieldName: "read_by", type: "string", length: 64 },
    readAt: { fieldName: "read_at", type: "datetime", defaultRaw: "now()" },
  },
});

export class DriverConsentRecord {
  id!: string;
  tenantId!: string;
  driverId!: string;
  channel!: string;
  state!: string;
  source!: string;
  requestedAt!: Date | null;
  respondedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const DriverConsentRecordSchema = new EntitySchema<DriverConsentRecord>({
  class: DriverConsentRecord,
  tableName: "fleet_driver_consents",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { fieldName: "tenant_id", type: "string", length: 64, index: true },
    driverId: { fieldName: "driver_id", type: "string", length: 64, index: true },
    channel: { type: "string", length: 16 },
    state: { type: "string", length: 16, default: "unknown" },
    source: { type: "string", length: 32, default: "operator" },
    requestedAt: { fieldName: "requested_at", type: "datetime", nullable: true },
    respondedAt: { fieldName: "responded_at", type: "datetime", nullable: true },
    createdAt: { fieldName: "created_at", type: "datetime", defaultRaw: "now()" },
    updatedAt: {
      fieldName: "updated_at",
      type: "datetime",
      onUpdate: () => new Date(),
      defaultRaw: "now()",
    },
  },
});

export class MaintenanceReminderScheduleRecord {
  id!: string;
  tenantId!: string;
  recipientEmail!: string;
  leadDays!: number;
  enabled!: boolean;
  lastRunAt!: Date | null;
  lastSentCount!: number | null;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const MaintenanceReminderScheduleRecordSchema =
  new EntitySchema<MaintenanceReminderScheduleRecord>({
    class: MaintenanceReminderScheduleRecord,
    tableName: "fleet_maintenance_reminder_schedules",
    properties: {
      id: { type: "string", primary: true },
      tenantId: { fieldName: "tenant_id", type: "string", length: 64, unique: true },
      recipientEmail: { fieldName: "recipient_email", type: "string", length: 254 },
      leadDays: { fieldName: "lead_days", type: "number", default: 30 },
      enabled: { type: "boolean", default: true },
      lastRunAt: { fieldName: "last_run_at", type: "datetime", nullable: true },
      lastSentCount: { fieldName: "last_sent_count", type: "number", nullable: true },
      createdBy: { fieldName: "created_by", type: "string", length: 64 },
      createdAt: { fieldName: "created_at", type: "datetime", defaultRaw: "now()" },
      updatedAt: {
        fieldName: "updated_at",
        type: "datetime",
        onUpdate: () => new Date(),
        defaultRaw: "now()",
      },
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
    cost: { type: "decimal", runtimeType: "number", nullable: true, precision: 12, scale: 2 },
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
  reminderSentAt!: Date | null;
  supersededAt!: Date | null;
  supersededById!: string | null;
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
    reminderSentAt: { type: "datetime", nullable: true },
    supersededAt: { type: "datetime", nullable: true },
    supersededById: { type: "string", length: 255, nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class AuditLogRecord {
  id!: string;
  tenantId!: string;
  entityType!: string;
  entityId!: string;
  action!: string;
  actorId!: string;
  metadata!: Record<string, unknown>;
  occurredAt!: Date;
  seq!: number;
  prevHash!: string;
  rowHash!: string;
}

export const AuditLogRecordSchema = new EntitySchema<AuditLogRecord>({
  class: AuditLogRecord,
  tableName: "fleet_audit_logs",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64, index: true },
    entityType: { type: "string", length: 64 },
    entityId: { type: "string", length: 255 },
    action: { type: "string", length: 128 },
    actorId: { type: "string", length: 64 },
    metadata: { type: "json" },
    occurredAt: { type: "datetime", defaultRaw: "now()" },
    seq: { type: "bigint", defaultRaw: "nextval('fleet_audit_logs_seq_seq')" },
    prevHash: { fieldName: "prev_hash", type: "string", length: 64 },
    rowHash: { fieldName: "row_hash", type: "string", length: 64 },
  },
});

export class DocumentRecord {
  id!: string;
  tenantId!: string;
  entityType!: string;
  entityId!: string;
  docType!: string;
  key!: string;
  filename!: string;
  contentType!: string;
  sizeBytes!: number;
  uploadedBy!: string;
  uploadedAt!: Date;
  expiresAt!: Date | null;
}

export const DocumentRecordSchema = new EntitySchema<DocumentRecord>({
  class: DocumentRecord,
  tableName: "fleet_documents",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64, index: true },
    entityType: { type: "string", length: 32 },
    entityId: { type: "string", length: 255 },
    docType: { type: "string", length: 32 },
    key: { type: "string", length: 1024 },
    filename: { type: "string", length: 255 },
    contentType: { type: "string", length: 255 },
    sizeBytes: { type: "integer", default: 0 },
    uploadedBy: { type: "string", length: 64 },
    uploadedAt: { type: "datetime", defaultRaw: "now()" },
    expiresAt: { type: "datetime", nullable: true },
  },
});

export class DocumentAccessLogRecord {
  id!: string;
  docId!: string;
  tenantId!: string;
  action!: string;
  userId!: string;
  ip!: string;
  at!: Date;
}

export const DocumentAccessLogRecordSchema = new EntitySchema<DocumentAccessLogRecord>({
  class: DocumentAccessLogRecord,
  tableName: "fleet_document_access_logs",
  properties: {
    id: { type: "string", primary: true },
    docId: { type: "string", length: 255, index: true },
    tenantId: { type: "string", length: 64, index: true },
    action: { type: "string", length: 32 },
    userId: { type: "string", length: 64 },
    ip: { type: "string", length: 64 },
    at: { type: "datetime", defaultRaw: "now()" },
  },
});

export class FleetFinancialConfigRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  monthlyWagesNgn!: number | null;
  monthlyInsuranceNgn!: number | null;
  monthlyDepreciationNgn!: number | null;
  monthlyParkingNgn!: number | null;
  monthlyOtherNgn!: number | null;
  fuelEstimateNgnPerMonth!: number | null;
  maintenanceEstimateNgnPerMonth!: number | null;
  driverWageAllocationMethod!: string | null;
  monthlyDriverWageNgn!: number | null;
  assetPurchasePriceNgn!: number | null;
  assetPurchaseDate!: string | null;
  assetUsefulLifeMonths!: number | null;
  assetSalvageValueNgn!: number | null;
  depreciationMethod!: string | null;
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
    monthlyWagesNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    monthlyInsuranceNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    monthlyDepreciationNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    monthlyParkingNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    monthlyOtherNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    fuelEstimateNgnPerMonth: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    maintenanceEstimateNgnPerMonth: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    driverWageAllocationMethod: { type: "string", length: 32, nullable: true },
    monthlyDriverWageNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    assetPurchasePriceNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    assetPurchaseDate: { type: "string", length: 10, nullable: true },
    assetUsefulLifeMonths: { type: "integer", nullable: true },
    assetSalvageValueNgn: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    depreciationMethod: { type: "string", length: 32, nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [{ properties: ["tenantId", "vehicleId"], options: { unique: true } }],
});

export class FleetFuelBudgetRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  periodType!: string;
  amountNgn!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const FleetFuelBudgetRecordSchema = new EntitySchema<FleetFuelBudgetRecord>({
  class: FleetFuelBudgetRecord,
  tableName: "fleet_fuel_budgets",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255, defaultRaw: "''" },
    periodType: { type: "string", length: 16, defaultRaw: "'monthly'" },
    amountNgn: { type: "decimal", precision: 14, scale: 2 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [{ properties: ["tenantId", "vehicleId"], options: { unique: true } }],
});

export class FleetFuelRecordRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  driverId!: string | null;
  vehicleType!: string | null;
  fuelType!: string | null;
  liters!: number;
  pricePerLiter!: number;
  totalCost!: number;
  station!: string | null;
  odometer!: number | null;
  recordedAt!: Date;
  recordedBy!: string;
  deletedAt!: Date | null;
  auditTrail!: Array<{ at: string; by: string; action: "create" | "edit" | "delete" }>;
  createdAt!: Date;
  updatedAt!: Date;
}

export const FleetFuelRecordRecordSchema = new EntitySchema<FleetFuelRecordRecord>({
  class: FleetFuelRecordRecord,
  tableName: "fleet_fuel_records",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 255 },
    driverId: { type: "string", length: 255, nullable: true },
    vehicleType: { type: "string", length: 64, nullable: true },
    fuelType: { type: "string", length: 16, nullable: true },
    liters: { type: "decimal", runtimeType: "number", precision: 12, scale: 3 },
    pricePerLiter: { type: "decimal", runtimeType: "number", precision: 14, scale: 2 },
    totalCost: { type: "decimal", runtimeType: "number", precision: 14, scale: 2 },
    station: { type: "string", length: 255, nullable: true },
    odometer: { type: "decimal", runtimeType: "number", nullable: true, precision: 14, scale: 2 },
    recordedAt: { type: "datetime" },
    recordedBy: { type: "string", length: 255 },
    deletedAt: { type: "datetime", nullable: true },
    auditTrail: { type: "json", defaultRaw: "'[]'" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [
    { name: "fleet_fuel_records_tenant_recorded_index", properties: ["tenantId", "recordedAt"] },
    { name: "fleet_fuel_records_tenant_vehicle_index", properties: ["tenantId", "vehicleId"] },
  ],
});

export class ZoneOccupancyRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  zoneId!: string;
  enteredAt!: Date;
  dwellNotifiedAt?: Date | null;
}

export const ZoneOccupancyRecordSchema = new EntitySchema<ZoneOccupancyRecord>({
  class: ZoneOccupancyRecord,
  tableName: "fleet_zone_occupancy",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 64 },
    zoneId: { type: "string", length: 64 },
    enteredAt: { type: "datetime", defaultRaw: "now()" },
    dwellNotifiedAt: { type: "datetime", nullable: true },
  },
  indexes: [
    // A vehicle is inside a zone once. The unique index is what stops a
    // duplicated position from recording a second entry.
    { properties: ["tenantId", "vehicleId", "zoneId"], options: { unique: true } },
    { properties: ["tenantId", "zoneId"] },
    { properties: ["enteredAt"] },
  ],
});

export class ShareLinkRecord {
  id!: string;
  tenantId!: string;
  vehicleId!: string;
  jobId?: string | null;
  tokenHash!: string;
  createdBy!: string;
  createdAt!: Date;
  expiresAt!: Date;
  revokedAt?: Date | null;
  lastViewedAt?: Date | null;
  viewCount!: number;
}

export const ShareLinkRecordSchema = new EntitySchema<ShareLinkRecord>({
  class: ShareLinkRecord,
  tableName: "fleet_tracking_share_links",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    vehicleId: { type: "string", length: 64 },
    jobId: { type: "string", length: 64, nullable: true },
    tokenHash: { type: "string", length: 128 },
    createdBy: { type: "string", length: 64 },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    expiresAt: { type: "datetime" },
    revokedAt: { type: "datetime", nullable: true },
    lastViewedAt: { type: "datetime", nullable: true },
    viewCount: { type: "integer", defaultRaw: "0" },
  },
  indexes: [
    { properties: ["tokenHash"], options: { unique: true } },
    { properties: ["tenantId", "vehicleId"] },
    { properties: ["jobId"] },
    { properties: ["expiresAt"] },
  ],
});

export class DeviceSetupRequestRecord {
  id!: string;
  tenantId!: string;
  requestedByUserId?: string | null;
  organisationName?: string | null;
  requestingEmail?: string | null;
  manufacturer!: string;
  model?: string | null;
  trackerType!: string;
  quantity!: number;
  simRequired!: boolean;
  carrierId?: string | null;
  planType?: string | null;
  bundleId?: string | null;
  vehicleId?: string | null;
  state?: string | null;
  city?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  useCase!: string;
  notes?: string | null;
  status!: string;
  timeline!: { status: string; at: string; note?: string | null }[];
  assignedTo?: string | null;
  decidedBy?: string | null;
  decidedAt?: Date | null;
  decisionReason?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const DeviceSetupRequestRecordSchema = new EntitySchema<DeviceSetupRequestRecord>({
  class: DeviceSetupRequestRecord,
  tableName: "fleet_device_setup_requests",
  properties: {
    id: { type: "string", primary: true },
    tenantId: { type: "string", length: 64 },
    requestedByUserId: { type: "string", length: 64, nullable: true },
    organisationName: { type: "string", length: 255, nullable: true },
    requestingEmail: { type: "string", length: 255, nullable: true },
    manufacturer: { type: "string", length: 64 },
    model: { type: "string", length: 64, nullable: true },
    trackerType: { type: "string", length: 32 },
    quantity: { type: "integer", defaultRaw: "1" },
    simRequired: { type: "boolean", defaultRaw: "false" },
    carrierId: { type: "string", length: 64, nullable: true },
    planType: { type: "string", length: 32, nullable: true },
    bundleId: { type: "string", length: 64, nullable: true },
    vehicleId: { type: "string", length: 64, nullable: true },
    state: { type: "string", length: 64, nullable: true },
    city: { type: "string", length: 64, nullable: true },
    preferredDate: { type: "string", length: 32, nullable: true },
    preferredTime: { type: "string", length: 32, nullable: true },
    useCase: { type: "text" },
    notes: { type: "text", nullable: true },
    status: { type: "string", length: 32, defaultRaw: "'pending_review'" },
    timeline: { type: "json" },
    assignedTo: { type: "string", length: 64, nullable: true },
    decidedBy: { type: "string", length: 64, nullable: true },
    decidedAt: { type: "datetime", nullable: true },
    decisionReason: { type: "string", length: 1000, nullable: true },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [
    { properties: ["tenantId", "status"] },
    { properties: ["tenantId", "createdAt"] },
    { properties: ["vehicleId"] },
  ],
});

export class CarrierRecord {
  id!: string;
  name!: string;
  code!: string;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CarrierRecordSchema = new EntitySchema<CarrierRecord>({
  class: CarrierRecord,
  tableName: "fleet_carriers",
  properties: {
    id: { type: "string", primary: true },
    name: { type: "string", length: 128 },
    code: { type: "string", length: 32, unique: true },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
});

export class DataBundleRecord {
  id!: string;
  carrierId!: string;
  name!: string;
  planType!: string;
  dataAllowanceMb!: number | null;
  priceNgn!: number;
  status!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const DataBundleRecordSchema = new EntitySchema<DataBundleRecord>({
  class: DataBundleRecord,
  tableName: "fleet_data_bundles",
  properties: {
    id: { type: "string", primary: true },
    carrierId: { type: "string", length: 64 },
    name: { type: "string", length: 128 },
    planType: { type: "string", length: 32 },
    dataAllowanceMb: { type: "integer", nullable: true },
    priceNgn: { type: "decimal", precision: 14, scale: 2 },
    status: { type: "string", length: 16, defaultRaw: "'active'" },
    createdAt: { type: "datetime", defaultRaw: "now()" },
    updatedAt: { type: "datetime", onUpdate: () => new Date(), defaultRaw: "now()" },
  },
  indexes: [{ properties: ["carrierId"] }],
});

let ormPromise: Promise<MikroORM> | null = null;

export async function getFleetOrm(cfg: DbConfig) {
  if (ormPromise) {
    return ormPromise;
  }

  ormPromise = retryDbConnect(() => initFleetOrm(cfg), { label: "fleet-orm" }).catch((error) => {
    ormPromise = null;
    throw error;
  });

  return ormPromise;
}

async function initFleetOrm(cfg: DbConfig) {
  const orm = await MikroORM.init({
    entities: [
      VehicleRecordSchema,
      DriverRecordSchema,
      DeviceRecordSchema,
      MaintenanceProfileRecordSchema,
      MaintenanceReminderScheduleRecordSchema,
      DriverConsentRecordSchema,
      DriverBehaviorEventRecordSchema,
      DriverFatigueAnalysisRecordSchema,
      GeofenceAlertReadRecordSchema,
      GeofenceZoneRecordSchema,
      GeofenceAssignmentRecordSchema,
      MaintenanceRecordOrmSchema,
      ComplianceDocumentRecordSchema,
      AuditLogRecordSchema,
      DocumentRecordSchema,
      DocumentAccessLogRecordSchema,
      FleetFinancialConfigRecordSchema,
      FleetFuelBudgetRecordSchema,
      FleetFuelRecordRecordSchema,
      DeviceSetupRequestRecordSchema,
      ZoneOccupancyRecordSchema,
      ShareLinkRecordSchema,
      CarrierRecordSchema,
      DataBundleRecordSchema,
      DeviceVerificationFailureRecordSchema,
      WaybillRecordSchema,
      PricingRuleRecordSchema,
      InvoiceSettingsRecordSchema,
      CustomerInvoiceRecordSchema,
    ],
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    dbName: cfg.dbName,
    pool: { min: cfg.poolMin ?? 2, max: cfg.poolMax ?? 10 },
    migrations: {
      path: process.env.NODE_ENV === "production"
        ? "dist/apps/fleet/src/migrations"
        : "apps/fleet/src/migrations",
      tableName: "mikro_migrations_fleet",
      safe: true,
      glob: "!(*.d).{js,ts}",
    },
  });

  try {
    await runMigrationsExclusively(orm);
    return orm;
  } catch (error) {
    await orm.close().catch(() => undefined);
    throw error;
  }
}
