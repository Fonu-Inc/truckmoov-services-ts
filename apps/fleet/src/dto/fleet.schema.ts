import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";

export class VehicleGpsDeviceSchema {
  @ApiProperty()
  imei!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  firmwareVersion!: string;

  @ApiProperty()
  installedAt!: string;
}

export class GpsDeviceSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  imei!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  firmwareVersion!: string;

  @ApiProperty({ nullable: true })
  installedAt!: string | null;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ enum: ["registered", "configured", "assigned", "active", "faulty", "decommissioned"] })
  status!: "registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned";

  @ApiProperty({ enum: ["registered", "config_pending", "configured", "verified_online", "assignable", "assigned", "faulty", "decommissioned"] })
  lifecycleStatus!: "registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned";

  @ApiProperty({ nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehicleRegistrationNumber!: string | null;

  @ApiProperty({ nullable: true, enum: ["active", "inactive"] })
  vehicleStatus!: "active" | "inactive" | null;

  @ApiProperty({ nullable: true })
  signalStrength!: number | null;

  @ApiProperty({ nullable: true })
  batteryLevel!: number | null;

  @ApiProperty({ nullable: true })
  lastSeen!: string | null;

  @ApiProperty({ nullable: true })
  assignedAt!: string | null;
}

export class DeviceSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  imei!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  firmwareVersion!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ enum: ["registered", "configured", "assigned", "active", "faulty", "decommissioned"] })
  status!: "registered" | "configured" | "assigned" | "active" | "faulty" | "decommissioned";

  @ApiProperty({ enum: ["registered", "config_pending", "configured", "verified_online", "assignable", "assigned", "faulty", "decommissioned"] })
  lifecycleStatus!: "registered" | "config_pending" | "configured" | "verified_online" | "assignable" | "assigned" | "faulty" | "decommissioned";

  @ApiProperty({ nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  signalStrength!: number | null;

  @ApiProperty({ nullable: true })
  batteryLevel!: number | null;

  @ApiProperty({ nullable: true })
  lastSeen!: string | null;

  @ApiProperty({ nullable: true })
  assignedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class DeviceResponse extends StandardApiResponse<DeviceSchema> {
  @ApiProperty({ type: DeviceSchema })
  data!: DeviceSchema;
}

export class DeviceListResponse extends StandardApiResponse<DeviceSchema[]> {
  @ApiProperty({ type: DeviceSchema, isArray: true })
  data!: DeviceSchema[];
}

export class DeviceAssignmentValidationSchema {
  @ApiProperty()
  canAssign!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class DeviceAssignmentValidationResponse extends StandardApiResponse<DeviceAssignmentValidationSchema> {
  @ApiProperty({ type: DeviceAssignmentValidationSchema })
  data!: DeviceAssignmentValidationSchema;
}

export class BulkDeviceImportSchema {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: DeviceSchema, isArray: true })
  records!: DeviceSchema[];
}

export class BulkDeviceImportResponse extends StandardApiResponse<BulkDeviceImportSchema> {
  @ApiProperty({ type: BulkDeviceImportSchema })
  data!: BulkDeviceImportSchema;
}

/** Vehicle record */
export class VehicleSchema {
  /** UUID */
  id!: string;
  /** Registration number used by the UI */
  registrationNumber!: string;
  /** License plate */
  plateNumber!: string;
  /** 17-character vehicle identification number */
  vin!: string | null;
  /** Manufacturer */
  make!: string | null;
  /** Make and model */
  model!: string;
  /** Manufacture year */
  year!: number | null;
  /** Vehicle body type */
  type!: "truck" | "van" | "trailer" | null;
  /** Carrying capacity in tons */
  capacity!: number | null;
  /** Tenant scope */
  tenantId!: string;
  /** Operational availability */
  status!: "active" | "inactive";
  /** Assigned driver ID, if any */
  assignedDriverId!: string | null;
  /** Mapped GPS device */
  gpsDevice!: VehicleGpsDeviceSchema | null;
}

export class VehicleResponse extends StandardApiResponse<VehicleSchema> {
  @ApiProperty({ type: VehicleSchema })
  data!: VehicleSchema;
}

export class VehicleListResponse extends StandardApiResponse<VehicleSchema[]> {
  @ApiProperty({ type: VehicleSchema, isArray: true })
  data!: VehicleSchema[];
}

export class GpsDeviceListResponse extends StandardApiResponse<GpsDeviceSchema[]> {
  @ApiProperty({ type: GpsDeviceSchema, isArray: true })
  data!: GpsDeviceSchema[];
}

export class DriverContactChannelsSchema {
  @ApiProperty({ nullable: true })
  whatsappNumber!: string | null;

  @ApiProperty({ nullable: true })
  smsNumber!: string | null;

  @ApiProperty({ nullable: true })
  voiceNumber!: string | null;
}

/** Driver record */
export class DriverSchema {
  /** UUID */
  id!: string;
  /** Driver first name */
  firstName!: string;
  /** Driver last name */
  lastName!: string;
  /** Full name */
  name!: string;
  /** Primary phone number */
  phone!: string;
  /** Optional email address */
  email!: string | null;
  /** Driver license number */
  licenseNumber!: string;
  /** License expiry date */
  licenseExpiryDate!: string | null;
  /** Tenant scope */
  tenantId!: string;
  /** Operational availability */
  status!: "active" | "available" | "offline" | "suspended";
  /** Preferred communication channel */
  communicationPreference!: "whatsapp" | "sms" | "email" | "voice";
  /** Assigned vehicle ID, if any */
  assignedVehicleId!: string | null;
  /** Contact channels used for dispatch communications */
  contactChannels!: DriverContactChannelsSchema;
  /** Record creation timestamp */
  createdAt!: string;
  /** Record update timestamp */
  updatedAt!: string;
}

export class DriverResponse extends StandardApiResponse<DriverSchema> {
  @ApiProperty({ type: DriverSchema })
  data!: DriverSchema;
}

export class DriverListResponse extends StandardApiResponse<DriverSchema[]> {
  @ApiProperty({ type: DriverSchema, isArray: true })
  data!: DriverSchema[];
}

export class JobSchema {
  @ApiProperty()
  jobId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class JobListResponse extends StandardApiResponse<JobSchema[]> {
  @ApiProperty({ type: JobSchema, isArray: true })
  data!: JobSchema[];
}

export class VehicleDriverAssignmentSchema {
  @ApiProperty({ type: VehicleSchema })
  vehicle!: VehicleSchema;

  @ApiProperty({ type: DriverSchema })
  driver!: DriverSchema;
}

export class VehicleDriverAssignmentResponse extends StandardApiResponse<VehicleDriverAssignmentSchema> {
  @ApiProperty({ type: VehicleDriverAssignmentSchema })
  data!: VehicleDriverAssignmentSchema;
}

export class BulkVehicleImportSchema {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: VehicleSchema, isArray: true })
  records!: VehicleSchema[];
}

export class BulkVehicleImportResponse extends StandardApiResponse<BulkVehicleImportSchema> {
  @ApiProperty({ type: BulkVehicleImportSchema })
  data!: BulkVehicleImportSchema;
}

export class BulkDriverImportSchema {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: DriverSchema, isArray: true })
  records!: DriverSchema[];
}

export class BulkDriverImportResponse extends StandardApiResponse<BulkDriverImportSchema> {
  @ApiProperty({ type: BulkDriverImportSchema })
  data!: BulkDriverImportSchema;
}

export class DispatchSearchSchema {
  @ApiProperty({ type: VehicleSchema, isArray: true })
  vehicles!: VehicleSchema[];

  @ApiProperty({ type: DriverSchema, isArray: true })
  drivers!: DriverSchema[];

  @ApiProperty({ type: JobSchema, isArray: true })
  jobs!: JobSchema[];
}

export class DispatchSearchResponse extends StandardApiResponse<DispatchSearchSchema> {
  @ApiProperty({ type: DispatchSearchSchema })
  data!: DispatchSearchSchema;
}

export class JobStatusResponse extends StandardApiResponse<null> {
  @ApiProperty({ nullable: true, type: "object" })
  data!: null;
}

export class FleetHealthResponse extends StandardApiResponse<{ service: string }> {
  @ApiProperty({ type: "object", properties: { service: { type: "string" } } })
  data!: { service: string };
}

export class VehicleHealthSchema {
  @ApiProperty()
  vehicleId!: string;

  @ApiProperty()
  plateNumber!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  assignedDriverId!: string | null;

  @ApiProperty({ nullable: true })
  deviceId!: string | null;

  @ApiProperty({ nullable: true })
  lastSeen!: number | null;

  @ApiProperty()
  healthy!: boolean;
}

export class VehicleHealthListResponse extends StandardApiResponse<VehicleHealthSchema[]> {
  @ApiProperty({ type: VehicleHealthSchema, isArray: true })
  data!: VehicleHealthSchema[];
}

export class VehicleHealthResponse extends StandardApiResponse<VehicleHealthSchema> {
  @ApiProperty({ type: VehicleHealthSchema })
  data!: VehicleHealthSchema;
}

export class NearestVehicleSchema {
  @ApiProperty()
  vehicleId!: string;

  @ApiProperty()
  plateNumber!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  assignedDriverId!: string | null;

  @ApiProperty()
  lat!: number;

  @ApiProperty()
  lng!: number;

  @ApiProperty()
  distanceKm!: number;
}

export class NearestVehicleListResponse extends StandardApiResponse<NearestVehicleSchema[]> {
  @ApiProperty({ type: NearestVehicleSchema, isArray: true })
  data!: NearestVehicleSchema[];
}

export class AlertSchema {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ enum: ["low", "medium", "high", "critical"] })
  severity!: string;

  @ApiProperty({ enum: ["open", "acknowledged", "resolved", "escalated"] })
  status!: string;

  @ApiProperty({ nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  jobId!: string | null;

  @ApiProperty({ type: "object" })
  details!: Record<string, unknown>;

  @ApiProperty()
  triggeredAt!: string;

  @ApiProperty({ nullable: true })
  acknowledgedAt!: string | null;

  @ApiProperty({ nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ nullable: true })
  escalatedAt!: string | null;

  @ApiProperty({ nullable: true })
  acknowledgedBy!: string | null;

  @ApiProperty({ nullable: true })
  resolvedBy!: string | null;
}

export class AlertListResponse extends StandardApiResponse<AlertSchema[]> {
  @ApiProperty({ type: AlertSchema, isArray: true })
  data!: AlertSchema[];
}

export class AlertResponse extends StandardApiResponse<AlertSchema> {
  @ApiProperty({ type: AlertSchema })
  data!: AlertSchema;
}

export class AlertStatsSchema {
  @ApiProperty()
  total!: number;

  @ApiProperty({ type: "object" })
  byStatus!: Record<string, number>;

  @ApiProperty({ type: "object" })
  byType!: Record<string, number>;

  @ApiProperty({ type: "object" })
  bySeverity!: Record<string, number>;

  @ApiProperty({ nullable: true })
  meanTimeToResolveMs!: number | null;
}

export class AlertStatsResponse extends StandardApiResponse<AlertStatsSchema> {
  @ApiProperty({ type: AlertStatsSchema })
  data!: AlertStatsSchema;
}

export class DashboardVehiclesSchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() assigned!: number;
  @ApiProperty() seenInLastHour!: number;
}

export class DashboardDriversSchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() assigned!: number;
}

export class DashboardJobsSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: "object" }) byStatus!: Record<string, number>;
}

export class DashboardAlertsSchema {
  @ApiProperty() open!: number;
  @ApiProperty() escalated!: number;
}

export class DashboardSchema {
  @ApiProperty({ type: DashboardVehiclesSchema }) vehicles!: DashboardVehiclesSchema;
  @ApiProperty({ type: DashboardDriversSchema }) drivers!: DashboardDriversSchema;
  @ApiProperty({ type: DashboardJobsSchema }) jobs!: DashboardJobsSchema;
  @ApiProperty({ type: DashboardAlertsSchema }) alerts!: DashboardAlertsSchema;
  @ApiProperty() generatedAt!: string;
}

export class DashboardResponse extends StandardApiResponse<DashboardSchema> {
  @ApiProperty({ type: DashboardSchema })
  data!: DashboardSchema;
}

export class DeliveryMetricsSchema {
  @ApiProperty() totalJobs!: number;
  @ApiProperty() delivered!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() deliverySuccessRate!: number;
  @ApiProperty({ nullable: true }) averageCycleTimeMs!: number | null;
  @ApiProperty() vehicleUtilizationRate!: number;
  @ApiProperty() generatedAt!: string;
}

export class DeliveryMetricsResponse extends StandardApiResponse<DeliveryMetricsSchema> {
  @ApiProperty({ type: DeliveryMetricsSchema })
  data!: DeliveryMetricsSchema;
}

export class DocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ enum: ["job", "vehicle", "driver"] }) entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ enum: ["pod", "invoice", "permit", "other"] }) docType!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() uploadedBy!: string;
  @ApiProperty() uploadedAt!: string;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
}

export class DocumentResponse extends StandardApiResponse<DocumentSchema> {
  @ApiProperty({ type: DocumentSchema })
  data!: DocumentSchema;
}

export class DocumentListResponse extends StandardApiResponse<DocumentSchema[]> {
  @ApiProperty({ type: DocumentSchema, isArray: true })
  data!: DocumentSchema[];
}

export class DownloadUrlSchema {
  @ApiProperty() url!: string;
  @ApiProperty() expiresIn!: number;
}

export class DownloadUrlResponse extends StandardApiResponse<DownloadUrlSchema> {
  @ApiProperty({ type: DownloadUrlSchema })
  data!: DownloadUrlSchema;
}

export class AccessLogEntrySchema {
  @ApiProperty() id!: string;
  @ApiProperty() docId!: string;
  @ApiProperty({ enum: ["upload", "download"] }) action!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() ip!: string;
  @ApiProperty() at!: string;
}

export class AccessLogListResponse extends StandardApiResponse<AccessLogEntrySchema[]> {
  @ApiProperty({ type: AccessLogEntrySchema, isArray: true })
  data!: AccessLogEntrySchema[];
}

export class UploadedMediaSchema {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  size!: number;
}

export class UploadedMediaResponse extends StandardApiResponse<UploadedMediaSchema> {
  @ApiProperty({ type: UploadedMediaSchema })
  data!: UploadedMediaSchema;
}

export class FuelRecordSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ nullable: true }) driverId!: string | null;
  @ApiProperty({ nullable: true }) vehicleType!: string | null;
  @ApiProperty() liters!: number;
  @ApiProperty() pricePerLiter!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty({ nullable: true }) station!: string | null;
  @ApiProperty({ nullable: true }) odometer!: number | null;
  @ApiProperty() recordedAt!: string;
  @ApiProperty() recordedBy!: string;
  @ApiProperty({ nullable: true }) deletedAt!: string | null;
}

export class FuelRecordResponse extends StandardApiResponse<FuelRecordSchema> {
  @ApiProperty({ type: FuelRecordSchema })
  data!: FuelRecordSchema;
}

export class FuelRecordListResponse extends StandardApiResponse<FuelRecordSchema[]> {
  @ApiProperty({ type: FuelRecordSchema, isArray: true })
  data!: FuelRecordSchema[];
}

export class ConsumptionBucketSchema {
  @ApiProperty() label!: string;
  @ApiProperty() liters!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty() records!: number;
}

export class FuelConsumptionResponse extends StandardApiResponse<ConsumptionBucketSchema[]> {
  @ApiProperty({ type: ConsumptionBucketSchema, isArray: true })
  data!: ConsumptionBucketSchema[];
}

export class VehicleEfficiencySchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ nullable: true }) kmPerLiter!: number | null;
  @ApiProperty() belowThreshold!: boolean;
  @ApiProperty({ nullable: true }) threshold!: number | null;
}

export class FuelEfficiencyResponse extends StandardApiResponse<VehicleEfficiencySchema[]> {
  @ApiProperty({ type: VehicleEfficiencySchema, isArray: true })
  data!: VehicleEfficiencySchema[];
}

export class FuelThresholdSchema {
  @ApiProperty() vehicleType!: string;
  @ApiProperty() minKmPerLiter!: number;
}

export class FuelThresholdResponse extends StandardApiResponse<FuelThresholdSchema> {
  @ApiProperty({ type: FuelThresholdSchema })
  data!: FuelThresholdSchema;
}

export class FuelThresholdListResponse extends StandardApiResponse<FuelThresholdSchema[]> {
  @ApiProperty({ type: FuelThresholdSchema, isArray: true })
  data!: FuelThresholdSchema[];
}
