import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

  @ApiProperty({ nullable: true })
  traccarDeviceId!: string | null;

  @ApiProperty({ enum: ["pending", "registered", "failed"] })
  provisionStatus!: "pending" | "registered" | "failed";

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

export class DeviceSetupRequestTimelineEntrySchema {
  @ApiProperty() status!: string;
  @ApiProperty() at!: string;
  @ApiProperty({ nullable: true }) note!: string | null;
}

export class DeviceSetupRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ nullable: true }) requestedByUserId!: string | null;
  @ApiProperty({ nullable: true }) organisationName!: string | null;
  @ApiProperty({ nullable: true }) requestingEmail!: string | null;
  @ApiProperty() manufacturer!: string;
  @ApiProperty({ nullable: true }) model!: string | null;
  @ApiProperty() trackerType!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() simRequired!: boolean;
  @ApiProperty({ nullable: true }) carrierId!: string | null;
  @ApiProperty({ nullable: true }) planType!: string | null;
  @ApiProperty({ nullable: true }) bundleId!: string | null;
  @ApiProperty({ nullable: true }) vehicleId!: string | null;
  @ApiProperty({ nullable: true }) state!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true }) preferredDate!: string | null;
  @ApiProperty({ nullable: true }) preferredTime!: string | null;
  @ApiProperty() useCase!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: DeviceSetupRequestTimelineEntrySchema, isArray: true })
  timeline!: DeviceSetupRequestTimelineEntrySchema[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class DeviceSetupRequestResponse extends StandardApiResponse<DeviceSetupRequestSchema> {
  @ApiProperty({ type: DeviceSetupRequestSchema })
  data!: DeviceSetupRequestSchema;
}

export class DeviceSetupRequestListResponse extends StandardApiResponse<DeviceSetupRequestSchema[]> {
  @ApiProperty({ type: DeviceSetupRequestSchema, isArray: true })
  data!: DeviceSetupRequestSchema[];
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
  @ApiProperty()
  id!: string;
  @ApiProperty()
  registrationNumber!: string;
  @ApiProperty()
  plateNumber!: string;
  @ApiProperty({ nullable: true })
  vin!: string | null;
  @ApiProperty({ nullable: true })
  make!: string | null;
  @ApiProperty()
  model!: string;
  @ApiProperty({ nullable: true })
  year!: number | null;
  @ApiProperty({ enum: ["truck", "van", "trailer"], nullable: true })
  type!: "truck" | "van" | "trailer" | null;
  @ApiPropertyOptional({ enum: ["diesel", "petrol", "ev", "hybrid"], nullable: true })
  fuelType?: "diesel" | "petrol" | "ev" | "hybrid" | null;
  @ApiProperty({ nullable: true })
  capacity!: number | null;
  @ApiProperty()
  tenantId!: string;
  @ApiProperty({ enum: ["active", "inactive", "maintenance", "decommissioned"] })
  status!: "active" | "inactive" | "maintenance" | "decommissioned";
  @ApiProperty({ nullable: true })
  assignedDriverId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  assignedDriverName?: string | null;
  @ApiPropertyOptional({ nullable: true })
  fuelLevelPercent?: number | null;
  @ApiProperty({ type: VehicleGpsDeviceSchema, nullable: true })
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

export class VehicleSummarySchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() maintenance!: number;
  @ApiProperty() decommissioned!: number;
}

export class VehicleSummaryResponse extends StandardApiResponse<VehicleSummarySchema> {
  @ApiProperty({ type: VehicleSummarySchema })
  data!: VehicleSummarySchema;
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
  createdAt!: string;

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

export class FuelTypeBreakdownSchema {
  @ApiProperty() liters!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty() records!: number;
}

export class ConsumptionBucketSchema {
  @ApiProperty() label!: string;
  @ApiProperty() liters!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty() records!: number;
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Per-fuel-type split keyed by diesel/petrol/ev/hybrid/unknown",
  })
  byFuelType!: Record<string, FuelTypeBreakdownSchema>;
}

export class FuelConsumptionResponse extends StandardApiResponse<ConsumptionBucketSchema[]> {
  @ApiProperty({ type: ConsumptionBucketSchema, isArray: true })
  data!: ConsumptionBucketSchema[];
}

export class FuelBudgetSchema {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: ["vehicle", "fleet"] }) scope!: "vehicle" | "fleet";
  @ApiProperty({ enum: ["daily", "weekly", "monthly"] }) periodType!: "daily" | "weekly" | "monthly";
  @ApiProperty() amountNgn!: number;
}

export class FuelBudgetListResponse extends StandardApiResponse<FuelBudgetSchema[]> {
  @ApiProperty({ type: FuelBudgetSchema, isArray: true })
  data!: FuelBudgetSchema[];
}

export class FuelBudgetResponse extends StandardApiResponse<FuelBudgetSchema> {
  @ApiProperty({ type: FuelBudgetSchema })
  data!: FuelBudgetSchema;
}

export class FuelBudgetVsActualRowSchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: ["daily", "weekly", "monthly"] }) periodType!: "daily" | "weekly" | "monthly";
  @ApiProperty() budgetedNgn!: number;
  @ApiProperty() actualNgn!: number;
  @ApiProperty() variance!: number;
  @ApiProperty({ nullable: true }) utilizationPct!: number | null;
}

export class FuelBudgetVsActualSchema {
  @ApiProperty() windowStart!: string;
  @ApiProperty() windowEnd!: string;
  @ApiProperty() windowDays!: number;
  @ApiProperty({ type: FuelBudgetVsActualRowSchema, isArray: true })
  vehicles!: FuelBudgetVsActualRowSchema[];
  @ApiProperty({ type: FuelBudgetVsActualRowSchema, nullable: true })
  fleet!: FuelBudgetVsActualRowSchema | null;
}

export class FuelBudgetVsActualResponse extends StandardApiResponse<FuelBudgetVsActualSchema> {
  @ApiProperty({ type: FuelBudgetVsActualSchema })
  data!: FuelBudgetVsActualSchema;
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

export class VehicleSafetyRadarSchema {
  @ApiProperty({ description: "Average braking score (0-100)" })
  braking!: number;

  @ApiProperty({ description: "Average acceleration score (0-100)" })
  acceleration!: number;

  @ApiProperty({ description: "Average speed-control score (0-100)" })
  speedControl!: number;

  @ApiProperty({ description: "Average cornering score (0-100)" })
  cornering!: number;

  @ApiProperty()
  periodDays!: number;
}

export class VehicleSafetyRadarResponse extends StandardApiResponse<VehicleSafetyRadarSchema> {
  @ApiProperty({ type: VehicleSafetyRadarSchema })
  data!: VehicleSafetyRadarSchema;
}

/* ── Webhooks ──────────────────────────────────────────────────────────── */

export class ErpWebhookDataSchema {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ description: "Internal job id created or updated" })
  jobId!: string;
}

export class ErpWebhookResponse extends StandardApiResponse<ErpWebhookDataSchema> {
  @ApiProperty({ type: ErpWebhookDataSchema })
  data!: ErpWebhookDataSchema;
}

export class IntegrationHealthSchema {
  @ApiProperty({ description: "Integration source key (cpaas, erp, gps_webhook, …)" })
  source!: string;

  @ApiProperty({ nullable: true, description: "ISO timestamp of last received event" })
  lastReceived!: string | null;

  @ApiProperty()
  successCount!: number;

  @ApiProperty()
  failureCount!: number;

  @ApiProperty({ description: "True if an event was received in the last hour" })
  healthy!: boolean;
}

export class IntegrationHealthResponse extends StandardApiResponse<IntegrationHealthSchema[]> {
  @ApiProperty({ type: IntegrationHealthSchema, isArray: true })
  data!: IntegrationHealthSchema[];
}

/* ── Shared message-only response ─────────────────────────────────────── */

export class MessageResponse extends StandardApiResponse<null> {
  @ApiProperty({ nullable: true, type: "object" })
  data!: null;
}

/* ── Analytics ────────────────────────────────────────────────────────── */

export class AnalyticsVehiclesSchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
  @ApiProperty() maintenance!: number;
  @ApiProperty() decommissioned!: number;
}

export class AnalyticsDriversSchema {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() inactive!: number;
}

export class AnalyticsJobsSchema {
  @ApiProperty() total!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() pending!: number;
}

export class AnalyticsSafetySchema {
  @ApiProperty() totalEvents!: number;
  @ApiProperty() open!: number;
  @ApiProperty() critical!: number;
}

export class AnalyticsSummarySchema {
  @ApiProperty({ type: AnalyticsVehiclesSchema }) vehicles!: AnalyticsVehiclesSchema;
  @ApiProperty({ type: AnalyticsDriversSchema }) drivers!: AnalyticsDriversSchema;
  @ApiProperty({ type: AnalyticsJobsSchema }) jobs!: AnalyticsJobsSchema;
  @ApiProperty({ type: AnalyticsSafetySchema }) safety!: AnalyticsSafetySchema;
  @ApiProperty() periodDays!: number;
}

export class AnalyticsSummaryResponse extends StandardApiResponse<AnalyticsSummarySchema> {
  @ApiProperty({ type: AnalyticsSummarySchema })
  data!: AnalyticsSummarySchema;
}

export class FleetStatusBreakdownSchema {
  @ApiProperty() id!: string;
  @ApiProperty() plateNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ nullable: true }) assignedDriverId!: string | null;
}

export class FleetStatusSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: "object" }) byStatus!: Record<string, number>;
  @ApiProperty({ type: FleetStatusBreakdownSchema, isArray: true }) breakdown!: FleetStatusBreakdownSchema[];
  @ApiProperty() periodDays!: number;
}

export class FleetStatusResponse extends StandardApiResponse<FleetStatusSchema> {
  @ApiProperty({ type: FleetStatusSchema })
  data!: FleetStatusSchema;
}

export class JobPipelineSchema {
  @ApiProperty() total!: number;
  @ApiProperty({ type: "object" }) byStatus!: Record<string, number>;
  @ApiProperty() periodDays!: number;
}

export class JobPipelineResponse extends StandardApiResponse<JobPipelineSchema> {
  @ApiProperty({ type: JobPipelineSchema })
  data!: JobPipelineSchema;
}

export class FuelLevelVehicleSchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() plateNumber!: string;
  @ApiProperty({ nullable: true }) fuelLevelPercent!: number | null;
  @ApiProperty({ nullable: true }) lastUpdated!: string | null;
}

export class FuelLevelsSchema {
  @ApiProperty() periodDays!: number;
  @ApiProperty({ type: FuelLevelVehicleSchema, isArray: true }) vehicles!: FuelLevelVehicleSchema[];
}

export class FuelLevelsResponse extends StandardApiResponse<FuelLevelsSchema> {
  @ApiProperty({ type: FuelLevelsSchema })
  data!: FuelLevelsSchema;
}

export class DriverScoreSchema {
  @ApiProperty() driverId!: string;
  @ApiProperty() driverName!: string;
  @ApiProperty() incidents!: number;
  @ApiProperty() harshBraking!: number;
  @ApiProperty() overspeeding!: number;
  @ApiProperty() safetyScore!: number;
}

export class DriverScoreListResponse extends StandardApiResponse<DriverScoreSchema[]> {
  @ApiProperty({ type: DriverScoreSchema, isArray: true })
  data!: DriverScoreSchema[];
}

export class AnalyticsEventSchema {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() severity!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) vehicleId!: string | null;
  @ApiProperty({ nullable: true }) jobId!: string | null;
  @ApiProperty({ type: "object" }) details!: Record<string, unknown>;
  @ApiProperty() triggeredAt!: string;
}

export class AnalyticsEventListResponse extends StandardApiResponse<AnalyticsEventSchema[]> {
  @ApiProperty({ type: AnalyticsEventSchema, isArray: true })
  data!: AnalyticsEventSchema[];
}

/* ── Maintenance profiles ─────────────────────────────────────────────── */

export class MaintenanceProfileSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() serviceType!: string;
  @ApiProperty() serviceLabel!: string;
  @ApiProperty({ enum: ["date", "mileage", "both", "months"] })
  intervalType!: "date" | "mileage" | "both" | "months";
  @ApiProperty({ nullable: true }) intervalDays!: number | null;
  @ApiProperty({ nullable: true }) intervalMonths!: number | null;
  @ApiProperty({ nullable: true }) intervalKm!: number | null;
  @ApiProperty({ nullable: true }) lastServiceDate!: string | null;
  @ApiProperty({ nullable: true }) lastServiceMileage!: number | null;
  @ApiProperty({ nullable: true }) currentMileage!: number | null;
  @ApiProperty({ enum: ["telemetry", "manual"] })
  mileageSource!: "telemetry" | "manual";
  @ApiProperty({ nullable: true }) nextDueDate!: string | null;
  @ApiProperty({ nullable: true }) nextDueMileage!: number | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ enum: ["overdue", "due", "upcoming", "completed"] })
  lifecycleStatus!: "overdue" | "due" | "upcoming" | "completed";
}

export class MaintenanceProfileResponse extends StandardApiResponse<MaintenanceProfileSchema> {
  @ApiProperty({ type: MaintenanceProfileSchema })
  data!: MaintenanceProfileSchema;
}

export class MaintenanceProfileListResponse extends StandardApiResponse<MaintenanceProfileSchema[]> {
  @ApiProperty({ type: MaintenanceProfileSchema, isArray: true })
  data!: MaintenanceProfileSchema[];
}

export class MaintenanceProfilesSummarySchema {
  @ApiProperty() total!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() due!: number;
  @ApiProperty() upcoming!: number;
  @ApiProperty() completed!: number;
}

export class MaintenanceProfilesSummaryResponse extends StandardApiResponse<MaintenanceProfilesSummarySchema> {
  @ApiProperty({ type: MaintenanceProfilesSummarySchema })
  data!: MaintenanceProfilesSummarySchema;
}

/* ── Maintenance records ──────────────────────────────────────────────── */

export class MaintenanceRecordSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() maintenanceType!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: ["scheduled", "in_progress", "completed", "cancelled"] })
  status!: "scheduled" | "in_progress" | "completed" | "cancelled";
  @ApiProperty({ enum: ["low", "medium", "high", "critical"] })
  priority!: "low" | "medium" | "high" | "critical";
  @ApiProperty({ nullable: true }) scheduledDate!: string | null;
  @ApiProperty({ nullable: true }) completedDate!: string | null;
  @ApiProperty({ nullable: true }) cost!: number | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true }) technician!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class MaintenanceRecordResponse extends StandardApiResponse<MaintenanceRecordSchema> {
  @ApiProperty({ type: MaintenanceRecordSchema })
  data!: MaintenanceRecordSchema;
}

export class MaintenanceRecordListResponse extends StandardApiResponse<MaintenanceRecordSchema[]> {
  @ApiProperty({ type: MaintenanceRecordSchema, isArray: true })
  data!: MaintenanceRecordSchema[];
}

export class MaintenanceRecordsSummarySchema {
  @ApiProperty() total!: number;
  @ApiProperty() scheduled!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() totalCostNgn!: number;
}

export class MaintenanceRecordsSummaryResponse extends StandardApiResponse<MaintenanceRecordsSummarySchema> {
  @ApiProperty({ type: MaintenanceRecordsSummarySchema })
  data!: MaintenanceRecordsSummarySchema;
}

export class ReminderQueuedSchema {
  @ApiProperty() queued!: number;
  @ApiProperty() message!: string;
}

export class ReminderQueuedResponse extends StandardApiResponse<ReminderQueuedSchema> {
  @ApiProperty({ type: ReminderQueuedSchema })
  data!: ReminderQueuedSchema;
}

/* ── Geofence zones ───────────────────────────────────────────────────── */

export class GeofenceZoneSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ type: "array", items: { type: "array", items: { type: "number" } } })
  coordinates!: number[][];
  @ApiProperty({ nullable: true }) radiusMeters!: number | null;
  @ApiProperty({ enum: ["ACTIVE", "ARCHIVED"] })
  status!: "ACTIVE" | "ARCHIVED";
  @ApiProperty({ type: String, isArray: true }) assignedVehicleIds!: string[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class GeofenceZoneResponse extends StandardApiResponse<GeofenceZoneSchema> {
  @ApiProperty({ type: GeofenceZoneSchema })
  data!: GeofenceZoneSchema;
}

export class GeofenceZoneListResponse extends StandardApiResponse<GeofenceZoneSchema[]> {
  @ApiProperty({ type: GeofenceZoneSchema, isArray: true })
  data!: GeofenceZoneSchema[];
}

/* ── Compliance documents ─────────────────────────────────────────────── */

export class ComplianceDocumentSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ nullable: true }) vehicleId!: string | null;
  @ApiProperty() documentType!: string;
  @ApiProperty() documentName!: string;
  @ApiProperty({ nullable: true }) issueDate!: string | null;
  @ApiProperty({ nullable: true }) expiryDate!: string | null;
  @ApiProperty() reminderDays!: number;
  @ApiProperty({ nullable: true }) fileUrl!: string | null;
  @ApiProperty({ nullable: true }) fileSize!: number | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ enum: ["valid", "expiring", "expired"] })
  status!: "valid" | "expiring" | "expired";
}

export class ComplianceDocumentResponse extends StandardApiResponse<ComplianceDocumentSchema> {
  @ApiProperty({ type: ComplianceDocumentSchema })
  data!: ComplianceDocumentSchema;
}

export class ComplianceDocumentListResponse extends StandardApiResponse<ComplianceDocumentSchema[]> {
  @ApiProperty({ type: ComplianceDocumentSchema, isArray: true })
  data!: ComplianceDocumentSchema[];
}

export class ComplianceSummarySchema {
  @ApiProperty() total!: number;
  @ApiProperty() valid!: number;
  @ApiProperty() expiringSoon!: number;
  @ApiProperty() expired!: number;
  @ApiProperty() complianceRatePercent!: number;
}

export class ComplianceSummaryResponse extends StandardApiResponse<ComplianceSummarySchema> {
  @ApiProperty({ type: ComplianceSummarySchema })
  data!: ComplianceSummarySchema;
}

/* ── Financials ───────────────────────────────────────────────────────── */

export class VehicleProfitabilitySchema {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() plateNumber!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() fuelCost!: number;
  @ApiProperty() maintenanceCost!: number;
  @ApiProperty() fixedCosts!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty() profit!: number;
  @ApiProperty() marginPercent!: number;
  @ApiProperty({ enum: ["excellent", "good", "marginal", "loss_making"] })
  tier!: "excellent" | "good" | "marginal" | "loss_making";
  @ApiProperty() jobCount!: number;
}

export class VehicleProfitabilityListResponse extends StandardApiResponse<VehicleProfitabilitySchema[]> {
  @ApiProperty({ type: VehicleProfitabilitySchema, isArray: true })
  data!: VehicleProfitabilitySchema[];
}

export class FinancialSummarySchema {
  @ApiProperty() totalRevenue!: number;
  @ApiProperty() totalCost!: number;
  @ApiProperty() totalProfit!: number;
  @ApiProperty() avgMarginPercent!: number;
  @ApiProperty() vehicleCount!: number;
}

export class FinancialSummaryResponse extends StandardApiResponse<FinancialSummarySchema> {
  @ApiProperty({ type: FinancialSummarySchema })
  data!: FinancialSummarySchema;
}

export class FinancialConfigSchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ nullable: true }) monthlyWagesNgn!: number | null;
  @ApiProperty({ nullable: true }) monthlyInsuranceNgn!: number | null;
  @ApiProperty({ nullable: true }) monthlyDepreciationNgn!: number | null;
  @ApiProperty({ nullable: true }) monthlyOtherNgn!: number | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class FinancialConfigResponse extends StandardApiResponse<FinancialConfigSchema> {
  @ApiProperty({ type: FinancialConfigSchema })
  data!: FinancialConfigSchema;
}

export class FinancialConfigNullableResponse extends StandardApiResponse<FinancialConfigSchema | null> {
  @ApiProperty({ type: FinancialConfigSchema, nullable: true })
  data!: FinancialConfigSchema | null;
}

export class FinancialConfigListResponse extends StandardApiResponse<FinancialConfigSchema[]> {
  @ApiProperty({ type: FinancialConfigSchema, isArray: true })
  data!: FinancialConfigSchema[];
}

/* ── Fuel summary ─────────────────────────────────────────────────────── */

export class FuelSummarySchema {
  @ApiProperty() totalLitres!: number;
  @ApiProperty() totalCostNgn!: number;
  @ApiProperty() avgPricePerLitre!: number;
  @ApiProperty() transactionCount!: number;
}

export class FuelSummaryResponse extends StandardApiResponse<FuelSummarySchema> {
  @ApiProperty({ type: FuelSummarySchema })
  data!: FuelSummarySchema;
}

/* ── Audit ────────────────────────────────────────────────────────────── */

export class AuditEntrySchema {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ enum: ["job", "vehicle", "driver", "device", "fuel", "alert", "document", "geofence"] })
  entityType!: "job" | "vehicle" | "driver" | "device" | "fuel" | "alert" | "document" | "geofence";
  @ApiProperty() entityId!: string;
  @ApiProperty() action!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty({ type: "object" }) metadata!: Record<string, unknown>;
  @ApiProperty() occurredAt!: string;
}

export class AuditEntryListResponse extends StandardApiResponse<AuditEntrySchema[]> {
  @ApiProperty({ type: AuditEntrySchema, isArray: true })
  data!: AuditEntrySchema[];
}

/* ── Service categories ───────────────────────────────────────────────── */

export class ServiceCategoryListResponse extends StandardApiResponse<string[]> {
  @ApiProperty({ type: String, isArray: true })
  data!: string[];
}
