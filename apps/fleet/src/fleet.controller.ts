import {
  BadRequestException,
  UnauthorizedException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { GeofenceService } from "@shared/geofence";
import { IdempotencyGuard, RequireIdempotency, Role, Roles, RolesGuard } from "@shared/rbac";
import { randomUUID } from "node:crypto";
import {
  BulkImportDriversDto,
  CreateDriverDto,
  DriverListQueryDto,
  JobListQueryDto,
  SetDriverStatusDto,
  UpdateDriverContactChannelsDto,
  UpdateDriverDto,
} from "./dto/driver.dto";
import {
  AssignDriverToVehicleDto,
  AssignDeviceToVehicleDto,
  BulkImportVehiclesDto,
  BulkImportDevicesDto,
  CreateDeviceDto,
  CreateVehicleDto,
  DeviceAssignmentValidationQueryDto,
  DeviceListQueryDto,
  DispatchSearchQueryDto,
  GpsDeviceListQueryDto,
  RegisterGpsDeviceDto,
  SetDeviceLifecycleStatusDto,
  SetVehicleStatusDto,
  UpdateDeviceDto,
  UpdateVehicleDto,
  VehicleListQueryDto,
} from "./dto/vehicle.dto";
import { LocationUpdateDto, SetGeofenceDto } from "./dto/geofence.dto";
import { FuelListQueryDto, FuelMetricsQueryDto, FuelThresholdDto, RecordFuelDto, UpdateFuelRecordDto } from "./dto/fuel.dto";
import {
  AccessLogListResponse,
  AlertListResponse,
  AlertResponse,
  AlertStatsResponse,
  BulkDriverImportResponse,
  BulkDeviceImportResponse,
  BulkVehicleImportResponse,
  DeviceAssignmentValidationResponse,
  DeviceListResponse,
  DeviceResponse,
  ConsumptionBucketSchema,
  DashboardResponse,
  DeliveryMetricsResponse,
  DispatchSearchResponse,
  DocumentListResponse,
  DocumentResponse,
  DownloadUrlResponse,
  DriverListResponse,
  DriverResponse,
  FleetHealthResponse,
  FuelConsumptionResponse,
  FuelEfficiencyResponse,
  FuelRecordListResponse,
  FuelRecordResponse,
  FuelThresholdListResponse,
  FuelThresholdResponse,
  GpsDeviceListResponse,
  JobListResponse,
  JobStatusResponse,
  NearestVehicleListResponse,
  UploadedMediaResponse,
  VehicleDriverAssignmentResponse,
  VehicleEfficiencySchema,
  VehicleHealthListResponse,
  VehicleHealthResponse,
  VehicleListResponse,
  VehicleResponse,
  VehicleSummaryResponse,
} from "./dto/fleet.schema";
import { haversineKm } from "./utils/haversine";
import {
  AssignDeviceToVehicleUseCase,
  BulkImportDevicesUseCase,
  CreateDeviceUseCase,
  DeleteDeviceUseCase,
  DeviceNotFoundError,
  GetDeviceUseCase,
  ListDevicesUseCase,
  SetDeviceLifecycleStatusUseCase,
  UnassignDeviceFromVehicleUseCase,
  UpdateDeviceUseCase,
  ValidateDeviceAssignmentUseCase,
} from "./contexts/fleet/devices";
import {
  BulkImportDriversUseCase,
  CreateDriverUseCase,
  DeleteDriverUseCase,
  DriverNotFoundError,
  GetDriverUseCase,
  ListDriversUseCase,
  SetDriverStatusUseCase,
  UpdateDriverContactChannelsUseCase,
  UpdateDriverUseCase,
} from "./contexts/fleet/drivers";
import { ListJobsUseCase, PublishJobStatusChangedUseCase } from "./contexts/fleet/jobs";
import {
  AcknowledgeAlertUseCase,
  AlertNotFoundError,
  GetAlertStatsUseCase,
  ListAlertsUseCase,
  ResolveAlertUseCase,
} from "./contexts/fleet/alerts";
import type { Alert as FleetAlert, AlertStatus } from "./contexts/fleet/alerts/domain/alert.entity";
import { DashboardUseCase, DeliveryMetricsUseCase, ExportUseCase, type ExportEntity } from "./contexts/fleet/reports";
import { FleetAnalyticsUseCase } from "./fleet-analytics.use-case";
import { MaintenanceProfilesUseCase, MaintenanceProfileNotFoundError } from "./maintenance-profiles.use-case";
import { GeofenceZonesUseCase, GeofenceZoneNotFoundError } from "./geofence-zones.use-case";
import { MaintenanceRecordsUseCase, MaintenanceRecordNotFoundError } from "./maintenance-records.use-case";
import { ComplianceDocumentsUseCase, ComplianceDocumentNotFoundError } from "./compliance-documents.use-case";
import { FleetFinancialsUseCase } from "./fleet-financials.use-case";
import { AuditLogService, type AuditEntityType } from "./audit-log.service";
import {
  GetDownloadUrlUseCase,
  ListAccessLogUseCase,
  ListDocumentsUseCase,
  UploadDocumentUseCase,
  type DocumentType,
  type EntityType,
} from "./contexts/fleet/documents";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";
import {
  AssignDriverToVehicleUseCase,
  BulkImportVehiclesUseCase,
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
  ListGpsDevicesUseCase,
  ListVehiclesUseCase,
  RegisterVehicleGpsDeviceUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  UpdateVehicleUseCase,
  VehicleNotFoundError,
} from "./contexts/fleet/vehicles";
import {
  DRIVER_STATUS_INPUTS,
  normalizeDriverStatus,
} from "./contexts/fleet/drivers/domain/entities/driver.entity";
import { VehicleHealthService } from "./vehicle-health.service";
import {
  DeleteFuelRecordUseCase,
  FuelMetricsUseCase,
  FuelRecordNotFoundError,
  FuelThresholdService,
  ListFuelRecordsUseCase,
  RecordFuelUseCase,
  UpdateFuelRecordUseCase,
} from "./contexts/fleet/fuel";

const HEALTH_THRESHOLD_MS = Number(process.env["VEHICLE_HEALTH_THRESHOLD_MS"] ?? 300_000);

type FleetRequestContext = {
  user?: { tenantId?: string; userId?: string; role?: string; email?: string };
  ip?: string;
};

@ApiTags("Fleet")
@Controller("fleet")
@UseGuards(RolesGuard)
export class FleetController {
  private readonly logger = new Logger(FleetController.name);
  constructor(
    @Inject(ListVehiclesUseCase)
    private readonly listVehiclesUseCase: ListVehiclesUseCase,
    @Inject(ListDevicesUseCase)
    private readonly listDevicesUseCase: ListDevicesUseCase,
    @Inject(GetDeviceUseCase)
    private readonly getDeviceUseCase: GetDeviceUseCase,
    @Inject(CreateDeviceUseCase)
    private readonly createDeviceUseCase: CreateDeviceUseCase,
    @Inject(UpdateDeviceUseCase)
    private readonly updateDeviceUseCase: UpdateDeviceUseCase,
    @Inject(DeleteDeviceUseCase)
    private readonly deleteDeviceUseCase: DeleteDeviceUseCase,
    @Inject(BulkImportDevicesUseCase)
    private readonly bulkImportDevicesUseCase: BulkImportDevicesUseCase,
    @Inject(AssignDeviceToVehicleUseCase)
    private readonly assignDeviceToVehicleUseCase: AssignDeviceToVehicleUseCase,
    @Inject(UnassignDeviceFromVehicleUseCase)
    private readonly unassignDeviceFromVehicleUseCase: UnassignDeviceFromVehicleUseCase,
    @Inject(SetDeviceLifecycleStatusUseCase)
    private readonly setDeviceLifecycleStatusUseCase: SetDeviceLifecycleStatusUseCase,
    @Inject(ValidateDeviceAssignmentUseCase)
    private readonly validateDeviceAssignmentUseCase: ValidateDeviceAssignmentUseCase,
    @Inject(ListGpsDevicesUseCase)
    private readonly listGpsDevicesUseCase: ListGpsDevicesUseCase,
    @Inject(CreateVehicleUseCase)
    private readonly createVehicleUseCase: CreateVehicleUseCase,
    @Inject(GetVehicleUseCase)
    private readonly getVehicleUseCase: GetVehicleUseCase,
    @Inject(UpdateVehicleUseCase)
    private readonly updateVehicleUseCase: UpdateVehicleUseCase,
    @Inject(DeleteVehicleUseCase)
    private readonly deleteVehicleUseCase: DeleteVehicleUseCase,
    @Inject(AssignDriverToVehicleUseCase)
    private readonly assignDriverToVehicleUseCase: AssignDriverToVehicleUseCase,
    @Inject(UnassignDriverFromVehicleUseCase)
    private readonly unassignDriverFromVehicleUseCase: UnassignDriverFromVehicleUseCase,
    @Inject(SetVehicleStatusUseCase)
    private readonly setVehicleStatusUseCase: SetVehicleStatusUseCase,
    @Inject(RegisterVehicleGpsDeviceUseCase)
    private readonly registerVehicleGpsDeviceUseCase: RegisterVehicleGpsDeviceUseCase,
    @Inject(BulkImportVehiclesUseCase)
    private readonly bulkImportVehiclesUseCase: BulkImportVehiclesUseCase,
    @Inject(ListDriversUseCase)
    private readonly listDriversUseCase: ListDriversUseCase,
    @Inject(CreateDriverUseCase)
    private readonly createDriverUseCase: CreateDriverUseCase,
    @Inject(GetDriverUseCase)
    private readonly getDriverUseCase: GetDriverUseCase,
    @Inject(UpdateDriverUseCase)
    private readonly updateDriverUseCase: UpdateDriverUseCase,
    @Inject(DeleteDriverUseCase)
    private readonly deleteDriverUseCase: DeleteDriverUseCase,
    @Inject(SetDriverStatusUseCase)
    private readonly setDriverStatusUseCase: SetDriverStatusUseCase,
    @Inject(UpdateDriverContactChannelsUseCase)
    private readonly updateDriverContactChannelsUseCase: UpdateDriverContactChannelsUseCase,
    @Inject(BulkImportDriversUseCase)
    private readonly bulkImportDriversUseCase: BulkImportDriversUseCase,
    @Inject(ListJobsUseCase)
    private readonly listJobsUseCase: ListJobsUseCase,
    @Inject(PublishJobStatusChangedUseCase)
    private readonly publishJobStatusChangedUseCase: PublishJobStatusChangedUseCase,
    private readonly geofenceService: GeofenceService,
    private readonly vehicleHealthService: VehicleHealthService,
    @Inject(ListAlertsUseCase) private readonly listAlertsUseCase: ListAlertsUseCase,
    @Inject(AcknowledgeAlertUseCase) private readonly acknowledgeAlertUseCase: AcknowledgeAlertUseCase,
    @Inject(ResolveAlertUseCase) private readonly resolveAlertUseCase: ResolveAlertUseCase,
    @Inject(GetAlertStatsUseCase) private readonly getAlertStatsUseCase: GetAlertStatsUseCase,
    @Inject(DashboardUseCase) private readonly dashboardUseCase: DashboardUseCase,
    @Inject(FleetAnalyticsUseCase) private readonly fleetAnalyticsUseCase: FleetAnalyticsUseCase,
    @Inject(MaintenanceProfilesUseCase) private readonly maintenanceProfilesUseCase: MaintenanceProfilesUseCase,
    @Inject(GeofenceZonesUseCase) private readonly geofenceZonesUseCase: GeofenceZonesUseCase,
    @Inject(MaintenanceRecordsUseCase) private readonly maintenanceRecordsUseCase: MaintenanceRecordsUseCase,
    @Inject(ComplianceDocumentsUseCase) private readonly complianceDocumentsUseCase: ComplianceDocumentsUseCase,
    @Inject(FleetFinancialsUseCase) private readonly fleetFinancialsUseCase: FleetFinancialsUseCase,
    @Inject(DeliveryMetricsUseCase) private readonly deliveryMetricsUseCase: DeliveryMetricsUseCase,
    @Inject(ExportUseCase) private readonly exportUseCase: ExportUseCase,
    @Inject(UploadDocumentUseCase) private readonly uploadDocumentUseCase: UploadDocumentUseCase,
    @Inject(GetDownloadUrlUseCase) private readonly getDownloadUrlUseCase: GetDownloadUrlUseCase,
    @Inject(ListDocumentsUseCase) private readonly listDocumentsUseCase: ListDocumentsUseCase,
    @Inject(ListAccessLogUseCase) private readonly listAccessLogUseCase: ListAccessLogUseCase,
    private readonly auditLog: AuditLogService,
    @Inject(RecordFuelUseCase) private readonly recordFuelUseCase: RecordFuelUseCase,
    @Inject(ListFuelRecordsUseCase) private readonly listFuelRecordsUseCase: ListFuelRecordsUseCase,
    @Inject(UpdateFuelRecordUseCase) private readonly updateFuelRecordUseCase: UpdateFuelRecordUseCase,
    @Inject(DeleteFuelRecordUseCase) private readonly deleteFuelRecordUseCase: DeleteFuelRecordUseCase,
    @Inject(FuelMetricsUseCase) private readonly fuelMetricsUseCase: FuelMetricsUseCase,
    @Inject(FuelThresholdService) private readonly fuelThresholdService: FuelThresholdService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  private serializeAlert(alert: FleetAlert) {
    return {
      ...alert.toPrimitives(),
      createdAt: alert.triggeredAt.toISOString(),
      triggeredAt: alert.triggeredAt.toISOString(),
      acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
      escalatedAt: alert.escalatedAt?.toISOString() ?? null,
    };
  }

  /** Health check */
  @Get("health")
  @ApiOkResponse({ type: FleetHealthResponse })
  health(): FleetHealthResponse {
    return { status: true, message: "success", data: { service: "fleet" } };
  }

  /** Readiness probe — L14 */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  @ApiOkResponse({ description: "Service readiness status" })
  ready(): { ready: boolean } {
    return { ready: true };
  }

  @Get("test-sentry")
  @ApiOperation({
    summary: "Trigger a test Sentry error",
    description: "Throws an unhandled error so Sentry capture can be verified.",
  })
  @ApiOkResponse({ description: "Never returns — always throws" })
  testSentry(): never {
    throw new Error("Sentry test error from fleet service");
  }

  @Post("routes/:vehicleId/geofence")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Register a geofence",
    description: "Stores a bounding box for a vehicle so we can detect deviations.",
  })
  @ApiCreatedResponse({ description: "Geofence stored" })
  async setGeofence(
    @Param("vehicleId") vehicleId: string,
    @Body() payload: SetGeofenceDto,
    @Req() req: FleetRequestContext,
  ) {
    this.geofenceService.set(vehicleId, {
      northeast: { lat: payload.northeast.lat, lng: payload.northeast.lng },
      southwest: { lat: payload.southwest.lat, lng: payload.southwest.lng },
    });
    await this.recordActivity(req, {
      entityType: "geofence",
      entityId: vehicleId,
      action: "vehicle.geofence.updated",
      summary: "Vehicle geofence updated",
      metadata: {
        northeast: payload.northeast,
        southwest: payload.southwest,
      },
    });
    return { status: true, message: "geofence registered" };
  }

  @Get("routes/:vehicleId/geofence")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Read the configured geofence" })
  @ApiOkResponse({ description: "Current bounding box" })
  async getGeofence(@Param("vehicleId") vehicleId: string) {
    return { status: true, geofence: this.geofenceService.get(vehicleId) };
  }

  @Post("routes/:vehicleId/location")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Report live position and detect deviations" })
  @ApiOkResponse({ description: "Deviation flag" })
  async reportLocation(
    @Param("vehicleId") vehicleId: string,
    @Body() payload: LocationUpdateDto,
  ) {
    this.vehicleHealthService.touch(vehicleId);
    const inside = this.geofenceService.isInside(vehicleId, {
      lat: payload.lat,
      lng: payload.lng,
    });
    if (!inside) {
      this.logger.warn(`Deviation for vehicle ${vehicleId} at ${payload.lat},${payload.lng}`);
    }
    return {
      status: true,
      deviation: !inside,
      point: payload,
      message: inside ? "within geofence" : "vehicle deviated",
    };
  }

  @Get("vehicles/:vehicleId/health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get last seen status" })
  @ApiOkResponse({ type: VehicleHealthResponse })
  async getVehicleHealth(@Param("vehicleId") vehicleId: string) {
    const vehicle = await this.runFleetUseCase(() => this.getVehicleUseCase.execute(vehicleId));
    return { status: true, data: this.buildHealth(vehicle as never) };
  }

  @Get("vehicles/health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List all last seen statuses" })
  @ApiOkResponse({ type: VehicleHealthListResponse })
  async listVehicleHealth(@Req() req: FleetRequestContext) {
    const vehicles = await this.listVehiclesUseCase.execute({ tenantId: this.tenantIdFromRequest(req) });
    const data = (vehicles as unknown as Array<{ id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { imei: string } | null }>)
      .map((v) => this.buildHealth(v));
    return { status: true, data };
  }

  @Get("vehicles/nearest")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({ summary: "Find nearest vehicles to a coordinate" })
  @ApiQuery({ name: "lat", required: true, type: Number })
  @ApiQuery({ name: "lng", required: true, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: NearestVehicleListResponse })
  async nearestVehicles(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("limit") limit = "5",
    @Req() req: FleetRequestContext,
  ): Promise<NearestVehicleListResponse> {
    const originLat = parseFloat(lat);
    const originLng = parseFloat(lng);
    const maxResults = parseInt(limit, 10) || 5;

    const vehicles = await this.listVehiclesUseCase.execute({ tenantId: this.tenantIdFromRequest(req) }) as unknown as Array<{
      id: string; plateNumber: string; model: string; assignedDriverId: string | null;
    }>;

    const data = vehicles
      .map((v) => {
        const entry = this.vehicleHealthService.get(v.id);
        if (!entry || entry.lat == null || entry.lng == null) return null;
        return {
          vehicleId: v.id,
          plateNumber: v.plateNumber,
          model: v.model,
          assignedDriverId: v.assignedDriverId,
          lat: entry.lat,
          lng: entry.lng,
          distanceKm: haversineKm(originLat, originLng, entry.lat, entry.lng),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, maxResults);

    return { status: true, message: "success", data } as unknown as NearestVehicleListResponse;
  }

  /** Retrieve vehicles with optional dispatch-centric filters */
  @Get("vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "List vehicles",
    description: "Epic C (US-C01, US-C04, US-C06): list/search/filter fleet vehicles.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive", "maintenance", "decommissioned"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "type", required: false, enum: ["truck", "van", "trailer"] })
  @ApiQuery({ name: "yearFrom", required: false, type: Number })
  @ApiQuery({ name: "yearTo", required: false, type: Number })
  @ApiOkResponse({ type: VehicleListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listVehicles(@Query() query: VehicleListQueryDto, @Req() req: FleetRequestContext): Promise<VehicleListResponse> {
    return this.listVehiclesUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: this.tenantIdFromRequest(req),
      type: query.type,
      yearFrom: query.yearFrom ? parseInt(query.yearFrom, 10) : undefined,
      yearTo: query.yearTo ? parseInt(query.yearTo, 10) : undefined,
    }) as unknown as Promise<VehicleListResponse>;
  }

  @Get("vehicles/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Vehicle summary stats", description: "Returns count of vehicles grouped by status for the calling tenant." })
  @ApiOkResponse({ type: VehicleSummaryResponse })
  async getVehicleSummary(@Req() req: FleetRequestContext): Promise<VehicleSummaryResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicles = await this.listVehiclesUseCase.execute({ tenantId });
    const counts = { total: 0, active: 0, inactive: 0, maintenance: 0, decommissioned: 0 };
    for (const v of vehicles as unknown as Array<{ status: string }>) {
      counts.total++;
      if (v.status === "active") counts.active++;
      else if (v.status === "inactive") counts.inactive++;
      else if (v.status === "maintenance") counts.maintenance++;
      else if (v.status === "decommissioned") counts.decommissioned++;
    }
    return { status: true, message: "success", data: counts } as unknown as VehicleSummaryResponse;
  }

  @Get("vehicles/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export vehicles as CSV", description: "Returns a CSV of all vehicles for the calling tenant." })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async exportVehicles(@Query() query: VehicleListQueryDto, @Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicles = await this.listVehiclesUseCase.execute({
      tenantId,
      query: query.query,
      status: query.status,
      type: query.type,
      yearFrom: query.yearFrom ? parseInt(query.yearFrom, 10) : undefined,
      yearTo: query.yearTo ? parseInt(query.yearTo, 10) : undefined,
    }) as unknown as Array<Record<string, unknown>>;
    const headers = ["id", "plateNumber", "make", "model", "year", "type", "status", "assignedDriverId", "assignedDriverName", "vin", "capacity"];
    const rows = [
      headers.join(","),
      ...vehicles.map((v) => headers.map((h) => JSON.stringify(v[h] ?? "")).join(",")),
    ];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicles.csv");
    res.send(rows.join("\n"));
  }

  /** Retrieve standalone device inventory for the fleet admin Devices page */
  @Get("devices")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "List devices",
    description: "Lists standalone GPS/IoT devices for the fleet admin Devices inventory page.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "manufacturer", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["registered", "configured", "assigned", "active", "faulty", "decommissioned"] })
  @ApiQuery({ name: "lifecycleStatus", required: false, enum: ["registered", "config_pending", "configured", "verified_online", "assignable", "assigned", "faulty", "decommissioned"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiOkResponse({ type: DeviceListResponse })
  async listDevices(@Query() query: DeviceListQueryDto, @Req() req: FleetRequestContext): Promise<DeviceListResponse> {
    return this.listDevicesUseCase.execute({
      query: query.query,
      manufacturer: query.manufacturer,
      status: query.status,
      lifecycleStatus: query.lifecycleStatus,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as Promise<DeviceListResponse>;
  }

  @Post("devices")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create device",
    description: "Registers a standalone GPS/IoT device before it is assigned to a vehicle.",
  })
  @ApiCreatedResponse({ type: DeviceResponse })
  async createDevice(@Body() payload: CreateDeviceDto, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.createDeviceUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "device",
      entityId: result.id,
      action: "device.created",
      summary: "Device registered",
      metadata: {
        imei: result.imei,
        manufacturer: result.manufacturer,
        model: result.model,
        lifecycleStatus: result.lifecycleStatus,
      },
    });
    return result as unknown as DeviceResponse;
  }

  @Post("devices/import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import devices",
    description: "Bulk registers or updates GPS/IoT devices for the fleet Devices inventory.",
  })
  @ApiCreatedResponse({ type: BulkDeviceImportResponse })
  async bulkImportDevices(@Body() payload: BulkImportDevicesDto, @Req() req: FleetRequestContext): Promise<BulkDeviceImportResponse> {
    const result = await this.bulkImportDevicesUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "device",
      entityId: randomUUID(),
      action: "device.bulk_imported",
      summary: "Device bulk import completed",
      metadata: {
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
    });
    return result as unknown as BulkDeviceImportResponse;
  }

  @Get("devices/:id")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({ summary: "Get device by ID" })
  @ApiOkResponse({ type: DeviceResponse })
  async getDevice(@Param("id") id: string): Promise<DeviceResponse> {
    return this.runFleetUseCase(() => this.getDeviceUseCase.execute(id)) as unknown as Promise<DeviceResponse>;
  }

  @Patch("devices/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update device" })
  @ApiOkResponse({ type: DeviceResponse })
  async updateDevice(
    @Param("id") id: string,
    @Body() payload: UpdateDeviceDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDeviceUseCase.execute({ id, ...payload }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.updated",
      summary: "Device updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  @Patch("devices/:id/lifecycle")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set device lifecycle status",
    description: "Advances or changes a device through the installation lifecycle used by the Devices page.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async setDeviceLifecycleStatus(
    @Param("id") id: string,
    @Body() payload: SetDeviceLifecycleStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.setDeviceLifecycleStatusUseCase.execute({ id, lifecycleStatus: payload.lifecycleStatus }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.lifecycle.updated",
      summary: "Device lifecycle status updated",
      metadata: { lifecycleStatus: payload.lifecycleStatus },
    });
    return result;
  }

  @Get("devices/:id/assignment/validate")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Validate device assignment",
    description: "Checks whether a device can be assigned to a specific vehicle before the UI submits the actual assignment.",
  })
  @ApiOkResponse({ type: DeviceAssignmentValidationResponse })
  async validateDeviceAssignment(
    @Param("id") id: string,
    @Query() query: DeviceAssignmentValidationQueryDto,
  ): Promise<DeviceAssignmentValidationResponse> {
    return this.validateDeviceAssignmentUseCase.execute(
      id,
      query.vehicleId,
    ) as unknown as DeviceAssignmentValidationResponse;
  }

  @Patch("devices/:id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Assign device to vehicle",
    description: "Assigns a standalone device inventory record to a fleet vehicle.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async assignDeviceToVehicle(
    @Param("id") id: string,
    @Body() payload: AssignDeviceToVehicleDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.assignDeviceToVehicleUseCase.execute({ deviceId: id, vehicleId: payload.vehicleId }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.assigned",
      summary: "Device assigned to vehicle",
      metadata: { vehicleId: payload.vehicleId },
    });
    return result;
  }

  @Delete("devices/:id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Unassign device from vehicle" })
  @ApiOkResponse({ type: DeviceResponse })
  async unassignDeviceFromVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.unassignDeviceFromVehicleUseCase.execute(id),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.unassigned",
      summary: "Device unassigned from vehicle",
    });
    return result;
  }

  @Delete("devices/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete device" })
  @ApiOkResponse({ type: DeviceResponse })
  async deleteDevice(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteDeviceUseCase.execute(id),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.deleted",
      summary: "Device deleted",
    });
    return result;
  }

  /** Retrieve GPS devices currently registered against fleet vehicles */
  @Get("gps-devices")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "List GPS devices",
    description: "Legacy alias for device inventory with vehicle mapping details preserved for older clients.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiOkResponse({ type: GpsDeviceListResponse })
  async listGpsDevices(@Query() query: GpsDeviceListQueryDto, @Req() req: FleetRequestContext): Promise<GpsDeviceListResponse> {
    return {
      status: true,
      message: "success",
      data: await this.listGpsDevicesUseCase.execute({
        query: query.query,
        vehicleStatus: query.vehicleStatus,
        tenantId: this.tenantIdFromRequest(req),
      }),
    } as GpsDeviceListResponse;
  }

  /** Register a new vehicle in the fleet */
  @Post("vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create vehicle",
    description: "Epic C (US-C01): create a new fleet vehicle.",
  })
  @ApiCreatedResponse({ type: VehicleResponse })
  async createVehicle(@Body() payload: CreateVehicleDto, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const result = await this.createVehicleUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: result.id,
      action: "vehicle.created",
      summary: "Vehicle created",
      metadata: {
        plateNumber: result.plateNumber,
        registrationNumber: result.registrationNumber,
        model: result.model,
        status: result.status,
      },
    });
    return result as unknown as VehicleResponse;
  }

  /** Bulk onboarding for fleet inventory imports */
  @Post("vehicles/import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import vehicles",
    description: "Epic C (US-C05): bulk upsert vehicles by plate number.",
  })
  @ApiCreatedResponse({ type: BulkVehicleImportResponse })
  async bulkImportVehicles(@Body() payload: BulkImportVehiclesDto, @Req() req: FleetRequestContext): Promise<BulkVehicleImportResponse> {
    const result = await this.bulkImportVehiclesUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: randomUUID(),
      action: "vehicle.bulk_imported",
      summary: "Vehicle bulk import completed",
      metadata: {
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
    });
    return result as unknown as BulkVehicleImportResponse;
  }

  /** Retrieve a vehicle by ID */
  @Get("vehicles/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Get vehicle by ID" })
  @ApiOkResponse({ type: VehicleResponse })
  async getVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() => this.getVehicleUseCase.execute(id)) as unknown as Promise<VehicleResponse>;
  }

  /** Partially update a vehicle's details */
  @Patch("vehicles/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async updateVehicle(
    @Param("id") id: string,
    @Body() payload: UpdateVehicleDto,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateVehicleUseCase.execute({ id, ...payload, tenantId: this.tenantIdFromRequest(req) }),
    ) as unknown as VehicleResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: id,
      action: "vehicle.updated",
      summary: "Vehicle updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  /** Activate/deactivate vehicle availability for dispatch */
  @Patch("vehicles/:id/status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set vehicle status",
    description: "Epic C (US-C04): activate/deactivate vehicle availability.",
  })
  @ApiOkResponse({ type: VehicleResponse })
  async setVehicleStatus(
    @Param("id") id: string,
    @Body() payload: SetVehicleStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.setVehicleStatusUseCase.execute({ id, status: payload.status }),
    ) as unknown as VehicleResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: id,
      action: "vehicle.status.updated",
      summary: "Vehicle status updated",
      metadata: { status: payload.status },
    });
    return result;
  }

  /** Assign a driver to a vehicle (US-C03) */
  @Patch("vehicles/:id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Assign driver to vehicle",
    description: "Epic C (US-C03): assign a driver record to a vehicle record.",
  })
  @ApiOkResponse({ type: VehicleDriverAssignmentResponse })
  @ApiBadRequestResponse({ description: "Invalid assignment rule (tenant/state mismatch)" })
  async assignDriverToVehicle(
    @Param("id") vehicleId: string,
    @Body() payload: AssignDriverToVehicleDto,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleDriverAssignmentResponse> {
    const result = await this.runFleetUseCase(() =>
      this.assignDriverToVehicleUseCase.execute({ vehicleId, driverId: payload.driverId }),
    ) as unknown as VehicleDriverAssignmentResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: vehicleId,
      action: "vehicle.driver.assigned",
      summary: "Driver assigned to vehicle",
      metadata: { driverId: payload.driverId },
    });
    return result;
  }

  /** Remove current driver assignment from a vehicle */
  @Delete("vehicles/:id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Unassign driver from vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async unassignDriverFromVehicle(
    @Param("id") vehicleId: string,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.unassignDriverFromVehicleUseCase.execute(vehicleId),
    ) as unknown as VehicleResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: vehicleId,
      action: "vehicle.driver.unassigned",
      summary: "Driver unassigned from vehicle",
    });
    return result;
  }

  /** Register or replace GPS hardware mapped to a vehicle */
  @Patch("vehicles/:id/gps-device")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Register GPS device on vehicle",
    description: "Epic C (US-C08): map a GPS device to a vehicle.",
  })
  @ApiOkResponse({ type: VehicleResponse })
  async registerGpsDevice(
    @Param("id") vehicleId: string,
    @Body() payload: RegisterGpsDeviceDto,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.registerVehicleGpsDeviceUseCase.execute({ vehicleId, ...payload }),
    ) as unknown as VehicleResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: vehicleId,
      action: "vehicle.gps_device.registered",
      summary: "Vehicle GPS device registered",
      metadata: {
        imei: payload.imei,
        manufacturer: payload.manufacturer,
        model: payload.model,
        firmwareVersion: payload.firmwareVersion,
      },
    });
    return result;
  }

  /** Remove a vehicle from the fleet */
  @Delete("vehicles/:id")
  @Roles(Role.ENTERPRISE_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async deleteVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id),
    ) as unknown as VehicleResponse;
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: id,
      action: "vehicle.deleted",
      summary: "Vehicle deleted",
    });
    return result;
  }

  /** Retrieve drivers with optional dispatch-centric filters */
  @Get("drivers")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "List drivers",
    description: "Epic C (US-C02, US-C04, US-C06): list/search/filter drivers.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: DRIVER_STATUS_INPUTS })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiOkResponse({ type: DriverListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listDrivers(@Query() query: DriverListQueryDto, @Req() req: FleetRequestContext): Promise<DriverListResponse> {
    return this.listDriversUseCase.execute({
      query: query.query,
      status: normalizeDriverStatus(query.status),
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as Promise<DriverListResponse>;
  }

  /** Register a new driver */
  @Post("drivers")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create driver",
    description: "Epic C (US-C02): create a new driver record.",
  })
  @ApiCreatedResponse({ type: DriverResponse })
  async createDriver(@Body() payload: CreateDriverDto, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    const result = await this.createDriverUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: result.id,
      action: "driver.created",
      summary: "Driver created",
      metadata: {
        name: result.name,
        licenseNumber: result.licenseNumber,
        status: result.status,
      },
    });
    return result as unknown as DriverResponse;
  }

  /** Bulk onboarding for driver records */
  @Post("drivers/import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import drivers",
    description: "Epic C (US-C05): bulk upsert drivers by license number.",
  })
  @ApiCreatedResponse({ type: BulkDriverImportResponse })
  async bulkImportDrivers(@Body() payload: BulkImportDriversDto, @Req() req: FleetRequestContext): Promise<BulkDriverImportResponse> {
    const result = await this.bulkImportDriversUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: randomUUID(),
      action: "driver.bulk_imported",
      summary: "Driver bulk import completed",
      metadata: {
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
    });
    return result as unknown as BulkDriverImportResponse;
  }

  /** Retrieve a driver by ID */
  @Get("drivers/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Get driver by ID" })
  @ApiOkResponse({ type: DriverResponse })
  async getDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() => this.getDriverUseCase.execute(id)) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */
  @Patch("drivers/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update driver" })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriver(
    @Param("id") id: string,
    @Body() payload: UpdateDriverDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDriverUseCase.execute({ id, ...payload, tenantId: this.tenantIdFromRequest(req) }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.updated",
      summary: "Driver updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  /** Activate/deactivate driver availability for dispatch */
  @Patch("drivers/:id/status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set driver status",
    description: "Epic C (US-C04): activate/deactivate driver availability.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async setDriverStatus(
    @Param("id") id: string,
    @Body() payload: SetDriverStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.setDriverStatusUseCase.execute({
        id,
        status: normalizeDriverStatus(payload.status) ?? "active",
      }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.status.updated",
      summary: "Driver status updated",
      metadata: {
        status: normalizeDriverStatus(payload.status) ?? "active",
      },
    });
    return result;
  }

  /** Manage WhatsApp/SMS/voice contact channels used for dispatch communication */
  @Patch("drivers/:id/contact-channels")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Update driver contact channels",
    description: "Epic C (US-C07): manage driver WhatsApp/SMS/voice channels.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriverContactChannels(
    @Param("id") id: string,
    @Body() payload: UpdateDriverContactChannelsDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDriverContactChannelsUseCase.execute({ id, channels: payload }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.contact_channels.updated",
      summary: "Driver contact channels updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  /** Remove a driver record */
  @Delete("drivers/:id")
  @Roles(Role.ENTERPRISE_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete driver" })
  @ApiOkResponse({ type: DriverResponse })
  async deleteDriver(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteDriverUseCase.execute(id),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.deleted",
      summary: "Driver deleted",
    });
    return result;
  }

  /** List jobs for dispatch search/filter use-cases */
  @Get("jobs")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "List jobs",
    description: "Epic C (US-C06): filter/search jobs for dispatch views.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiOkResponse({ type: JobListResponse })
  async listJobs(@Query() query: JobListQueryDto, @Req() req: FleetRequestContext): Promise<JobListResponse> {
    return this.listJobsUseCase.execute({
      query: query.query,
      status: query.status,
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as Promise<JobListResponse>;
  }

  /** Combined dispatcher search over vehicles, drivers, and jobs */
  @Get("dispatch/search")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Dispatch search",
    description: "Epic C (US-C06): combined search/filter over vehicles, drivers, and jobs.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "driverStatus", required: false, enum: DRIVER_STATUS_INPUTS })
  @ApiQuery({ name: "jobStatus", required: false, type: String })
  @ApiQuery({ name: "assignedOnly", required: false, enum: ["true", "false"] })
  @ApiOkResponse({ type: DispatchSearchResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async searchDispatch(@Query() query: DispatchSearchQueryDto, @Req() req: FleetRequestContext): Promise<DispatchSearchResponse> {
    const assignedOnly = this.parseOptionalBoolean(query.assignedOnly, "assignedOnly");

    // Run in parallel because this endpoint is read-only aggregation across three repositories.
    const [vehicles, drivers, jobs] = await Promise.all([
      this.listVehiclesUseCase.execute({
        query: query.query,
        status: query.vehicleStatus,
        assigned: assignedOnly,
        tenantId: this.tenantIdFromRequest(req),
      }),
      this.listDriversUseCase.execute({
        query: query.query,
        status: normalizeDriverStatus(query.driverStatus),
        assigned: assignedOnly,
        tenantId: this.tenantIdFromRequest(req),
      }),
      this.listJobsUseCase.execute({
        query: query.query,
        status: query.jobStatus,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ]);

    return { vehicles, drivers, jobs } as unknown as DispatchSearchResponse;
  }

  /** Emit a job-status-changed domain event to the event bus */
  @Post("events/job-status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Publish job status event",
    description: "Records job status snapshot and emits job.status.changed event.",
  })
  @ApiCreatedResponse({ type: JobStatusResponse })
  async publishSampleEvent(
    @Query("jobId") jobId = "demo-job",
    @Query("status") status = "assigned",
    @Req() req: FleetRequestContext,
  ): Promise<JobStatusResponse> {
    const result = await this.publishJobStatusChangedUseCase.execute({
      jobId,
      status,
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as JobStatusResponse;
    await this.recordActivity(req, {
      entityType: "job",
      entityId: jobId,
      action: "job.status.event.published",
      summary: "Job status event published",
      metadata: { status },
    });
    return result;
  }

  @Get("alerts/stats")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Alert statistics — H06" })
  @ApiOkResponse({ type: AlertStatsResponse })
  async getAlertStats(@Req() req: FleetRequestContext): Promise<AlertStatsResponse> {
    const data = await this.getAlertStatsUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as AlertStatsResponse;
  }

  @Get("alerts")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({ summary: "List alerts — H04" })
  @ApiQuery({ name: "status", required: false, enum: ["open", "acknowledged", "resolved", "escalated"] })
  @ApiQuery({ name: "type", required: false, type: String })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiOkResponse({ type: AlertListResponse })
  async listAlerts(
    @Req() req: FleetRequestContext,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("vehicleId") vehicleId?: string,
  ): Promise<AlertListResponse> {
    const alerts = await this.listAlertsUseCase.execute(this.tenantIdFromRequest(req), {
      status: status as AlertStatus | undefined,
      type,
      vehicleId,
    });
    const data = alerts.map((alert) => this.serializeAlert(alert));
    return { status: true, message: "success", data } as unknown as AlertListResponse;
  }

  @Post("alerts/:id/acknowledge")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Acknowledge alert — H04" })
  @ApiOkResponse({ type: AlertResponse })
  async acknowledgeAlert(
    @Param("id") id: string,
    @Query("by") by = "system",
    @Req() req: FleetRequestContext,
  ): Promise<AlertResponse> {
    try {
      const alert = await this.acknowledgeAlertUseCase.execute(
        this.tenantIdFromRequest(req),
        id,
        by === "system" ? req.user?.userId ?? "system" : by,
      );
      await this.recordActivity(req, {
        entityType: "alert",
        entityId: id,
        action: "alert.acknowledged",
        summary: "Alert acknowledged",
        metadata: {
          status: alert.status,
          type: alert.type,
          vehicleId: alert.vehicleId,
        },
      });
      return { status: true, message: "success", data: this.serializeAlert(alert) } as unknown as AlertResponse;
    } catch (e) {
      if (e instanceof AlertNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Post("alerts/:id/resolve")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Resolve alert — H04" })
  @ApiOkResponse({ type: AlertResponse })
  async resolveAlert(
    @Param("id") id: string,
    @Query("by") by = "system",
    @Req() req: FleetRequestContext,
  ): Promise<AlertResponse> {
    try {
      const alert = await this.resolveAlertUseCase.execute(
        this.tenantIdFromRequest(req),
        id,
        by === "system" ? req.user?.userId ?? "system" : by,
      );
      await this.recordActivity(req, {
        entityType: "alert",
        entityId: id,
        action: "alert.resolved",
        summary: "Alert resolved",
        metadata: {
          status: alert.status,
          type: alert.type,
          vehicleId: alert.vehicleId,
        },
      });
      return { status: true, message: "success", data: this.serializeAlert(alert) } as unknown as AlertResponse;
    } catch (e) {
      if (e instanceof AlertNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Get("reports/dashboard")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Operational dashboard — I01" })
  @ApiOkResponse({ type: DashboardResponse })
  async getDashboard(@Req() req: FleetRequestContext): Promise<DashboardResponse> {
    const data = await this.dashboardUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as DashboardResponse;
  }

  @Get("analytics/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Analytics summary", description: "High-level fleet summary across vehicles, drivers, jobs, and safety events for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [7, 30, 60, 90], type: Number })
  @ApiOkResponse({ description: "Analytics summary object" })
  async getAnalyticsSummary(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.summary(this.tenantIdFromRequest(req), parseInt(periodDays ?? "30", 10));
    return { status: true, message: "success", data };
  }

  @Get("analytics/fleet-status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fleet status breakdown", description: "Vehicles grouped by status for the calling tenant." })
  @ApiQuery({ name: "period_days", required: false, enum: [1, 2, 7, 30, 90], type: Number })
  @ApiOkResponse({ description: "Fleet status breakdown" })
  async getFleetStatus(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.fleetStatus(this.tenantIdFromRequest(req), parseInt(periodDays ?? "30", 10));
    return { status: true, message: "success", data };
  }

  @Get("analytics/job-pipeline")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Job pipeline", description: "Jobs grouped by status for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [7, 30, 60, 90], type: Number })
  @ApiOkResponse({ description: "Job pipeline breakdown" })
  async getJobPipeline(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.jobPipeline(this.tenantIdFromRequest(req), parseInt(periodDays ?? "30", 10));
    return { status: true, message: "success", data };
  }

  @Get("analytics/fuel-levels")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fuel levels", description: "Per-vehicle fuel level (from telemetry where available)." })
  @ApiQuery({ name: "period_days", required: false, enum: [1, 2, 7, 30, 90], type: Number })
  @ApiOkResponse({ description: "Fuel level array per vehicle" })
  async getFuelLevels(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.fuelLevels(this.tenantIdFromRequest(req), parseInt(periodDays ?? "30", 10));
    return { status: true, message: "success", data };
  }

  @Get("analytics/driver-scores")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Driver safety scores", description: "Safety scores per driver based on behavior events in the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [7, 30, 60, 90], type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Driver scores array" })
  async getDriverScores(@Query("period_days") periodDays: string, @Query("limit") limit: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.driverScores(
      this.tenantIdFromRequest(req),
      parseInt(periodDays ?? "30", 10),
      parseInt(limit ?? "20", 10),
    );
    return { status: true, message: "success", data };
  }

  @Get("analytics/events")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Behavior events", description: "Alert/behavior event list with filters for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [7, 30, 60, 90], type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "severity", required: false, enum: ["low", "medium", "high", "critical"] })
  @ApiOkResponse({ description: "Events array" })
  async getAnalyticsEvents(
    @Query("period_days") periodDays: string,
    @Query("limit") limit: string,
    @Query("severity") severity: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.fleetAnalyticsUseCase.events(
      this.tenantIdFromRequest(req),
      parseInt(periodDays ?? "30", 10),
      parseInt(limit ?? "50", 10),
      severity,
    );
    return { status: true, message: "success", data };
  }

  @Get("analytics/vehicle-safety-radar")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fleet safety radar", description: "Average driver behavior scores across the fleet: braking, acceleration, speed control, and cornering for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [1, 2, 7, 30, 90], type: Number })
  @ApiOkResponse({ description: "Average behavior scores per dimension (0-100)" })
  async getVehicleSafetyRadar(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.vehicleSafetyRadar(this.tenantIdFromRequest(req), parseInt(periodDays ?? "30", 10));
    return { status: true, message: "success", data };
  }

  /* ── Maintenance Profiles ──────────────────────────────────────────────── */

  @Get("maintenance/profiles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance profiles" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "lifecycleStatus", required: false, enum: ["overdue", "due", "upcoming", "completed"] })
  @ApiQuery({ name: "nextDueDateFrom", required: false, type: String })
  @ApiQuery({ name: "nextDueDateTo", required: false, type: String })
  @ApiOkResponse({ description: "Maintenance profiles array" })
  async listMaintenanceProfiles(
    @Query("vehicleId") vehicleId: string,
    @Query("lifecycleStatus") lifecycleStatus: string,
    @Query("nextDueDateFrom") nextDueDateFrom: string,
    @Query("nextDueDateTo") nextDueDateTo: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.maintenanceProfilesUseCase.list(this.tenantIdFromRequest(req), {
      vehicleId,
      lifecycleStatus: lifecycleStatus as any,
      nextDueDateFrom,
      nextDueDateTo,
    });
    return { status: true, message: "success", data };
  }

  @Post("maintenance/profiles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance profile" })
  @ApiCreatedResponse({ description: "Maintenance profile created" })
  async createMaintenanceProfile(@Body() body: any, @Req() req: FleetRequestContext) {
    const data = await this.maintenanceProfilesUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Delete("maintenance/profiles/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete maintenance profile" })
  @ApiOkResponse({ description: "Deleted" })
  async deleteMaintenanceProfile(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.maintenanceProfilesUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof MaintenanceProfileNotFoundError) throw new NotFoundException("Maintenance profile not found");
      throw e;
    }
  }

  @Post("maintenance/profiles/:id/complete")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Mark maintenance profile as completed" })
  @ApiOkResponse({ description: "Completed" })
  async completeMaintenanceProfile(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const data = await this.maintenanceProfilesUseCase.complete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceProfileNotFoundError) throw new NotFoundException("Maintenance profile not found");
      throw e;
    }
  }

  @Get("maintenance/profiles/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Maintenance profiles summary" })
  @ApiOkResponse({ description: "Summary counts" })
  async getMaintenanceProfilesSummary(@Req() req: FleetRequestContext) {
    const data = await this.maintenanceProfilesUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("maintenance/service-categories")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance service categories" })
  @ApiOkResponse({ description: "Service categories list" })
  async getMaintenanceServiceCategories() {
    return { status: true, message: "success", data: this.maintenanceProfilesUseCase.serviceCategories() };
  }

  @Get("maintenance/profiles/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export maintenance profiles as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportMaintenanceProfiles(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.maintenanceProfilesUseCase.export(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=maintenance-profiles.csv");
    res.send(csv);
  }

  /* ── Geofence Zones ────────────────────────────────────────────────────── */

  @Get("geofences")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List geofence zones" })
  @ApiQuery({ name: "status", required: false, enum: ["ACTIVE", "ARCHIVED"] })
  @ApiOkResponse({ description: "Geofence zones array" })
  async listGeofenceZones(@Query("status") status: string, @Req() req: FleetRequestContext) {
    const data = await this.geofenceZonesUseCase.list(this.tenantIdFromRequest(req), { status: (status as any) ?? "ACTIVE" });
    return { status: true, message: "success", data };
  }

  @Post("geofences")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create geofence zone" })
  @ApiCreatedResponse({ description: "Zone created" })
  async createGeofenceZone(@Body() body: any, @Req() req: FleetRequestContext) {
    const data = await this.geofenceZonesUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Patch("geofences/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update geofence zone" })
  @ApiOkResponse({ description: "Zone updated" })
  async updateGeofenceZone(@Param("id") id: string, @Body() body: any, @Req() req: FleetRequestContext) {
    try {
      const data = await this.geofenceZonesUseCase.update(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  @Delete("geofences/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Archive geofence zone (soft delete)" })
  @ApiOkResponse({ description: "Zone archived" })
  async deleteGeofenceZone(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.geofenceZonesUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  @Put("geofences/:id/vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set vehicle assignments for a geofence zone" })
  @ApiOkResponse({ description: "Assignments updated" })
  async setGeofenceVehicleAssignments(@Param("id") id: string, @Body() body: { vehicleIds: string[] }, @Req() req: FleetRequestContext) {
    try {
      const data = await this.geofenceZonesUseCase.setVehicleAssignments(this.tenantIdFromRequest(req), id, body.vehicleIds ?? []);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  /* ── Maintenance Records ───────────────────────────────────────────────── */

  @Get("maintenance/records")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance records" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["scheduled", "in_progress", "completed", "cancelled", "overdue"] })
  @ApiQuery({ name: "priority", required: false, enum: ["low", "medium", "high", "critical"] })
  @ApiQuery({ name: "maintenanceType", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiOkResponse({ description: "Maintenance records array" })
  async listMaintenanceRecords(
    @Query("vehicleId") vehicleId: string,
    @Query("status") status: string,
    @Query("priority") priority: string,
    @Query("maintenanceType") maintenanceType: string,
    @Query("search") search: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.maintenanceRecordsUseCase.list(this.tenantIdFromRequest(req), {
      vehicleId, status: status as any, priority: priority as any, maintenanceType, search,
    });
    return { status: true, message: "success", data };
  }

  @Post("maintenance/records")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance record" })
  @ApiCreatedResponse({ description: "Record created" })
  async createMaintenanceRecord(@Body() body: any, @Req() req: FleetRequestContext) {
    const data = await this.maintenanceRecordsUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Get("maintenance/records/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Maintenance records summary" })
  @ApiOkResponse({ description: "Summary counts" })
  async getMaintenanceRecordsSummary(@Req() req: FleetRequestContext) {
    const data = await this.maintenanceRecordsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("maintenance/records/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export maintenance records as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportMaintenanceRecords(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.maintenanceRecordsUseCase.export(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=maintenance-records.csv");
    res.send(csv);
  }

  @Get("maintenance/records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get maintenance record" })
  @ApiOkResponse({ description: "Maintenance record" })
  async getMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const data = await this.maintenanceRecordsUseCase.findOne(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Patch("maintenance/records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update maintenance record" })
  @ApiOkResponse({ description: "Updated" })
  async updateMaintenanceRecord(@Param("id") id: string, @Body() body: any, @Req() req: FleetRequestContext) {
    try {
      const data = await this.maintenanceRecordsUseCase.update(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Delete("maintenance/records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete maintenance record" })
  @ApiOkResponse({ description: "Deleted" })
  async deleteMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.maintenanceRecordsUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("maintenance/records/:id/start")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Start maintenance record" })
  @ApiOkResponse({ description: "Started" })
  async startMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const data = await this.maintenanceRecordsUseCase.transition(this.tenantIdFromRequest(req), id, "in_progress");
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("maintenance/records/:id/complete")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Complete maintenance record" })
  @ApiOkResponse({ description: "Completed" })
  async completeMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const data = await this.maintenanceRecordsUseCase.transition(this.tenantIdFromRequest(req), id, "completed");
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("maintenance/reminders/send")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Send maintenance reminders" })
  @ApiOkResponse({ description: "Reminders queued" })
  async sendMaintenanceReminders(@Req() req: FleetRequestContext) {
    const summary = await this.maintenanceRecordsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: { queued: summary.overdue, message: "Reminders will be sent to assigned drivers" } };
  }

  /* ── Compliance Documents ──────────────────────────────────────────────── */

  @Get("compliance/documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List compliance documents" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "documentType", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["valid", "expiring", "expired"] })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiOkResponse({ description: "Compliance documents array" })
  async listComplianceDocuments(
    @Query("vehicleId") vehicleId: string,
    @Query("documentType") documentType: string,
    @Query("status") status: string,
    @Query("search") search: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.complianceDocumentsUseCase.list(this.tenantIdFromRequest(req), {
      vehicleId, documentType, status: status as any, search,
    });
    return { status: true, message: "success", data };
  }

  @Post("compliance/documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create compliance document" })
  @ApiCreatedResponse({ description: "Document created" })
  async createComplianceDocument(@Body() body: any, @Req() req: FleetRequestContext) {
    const data = await this.complianceDocumentsUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Get("compliance/documents/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Compliance documents summary" })
  @ApiOkResponse({ description: "Summary counts" })
  async getComplianceDocumentsSummary(@Req() req: FleetRequestContext) {
    const data = await this.complianceDocumentsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("compliance/documents/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export compliance documents as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportComplianceDocuments(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.complianceDocumentsUseCase.export(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=compliance-documents.csv");
    res.send(csv);
  }

  @Patch("compliance/documents/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update compliance document" })
  @ApiOkResponse({ description: "Updated" })
  async updateComplianceDocument(@Param("id") id: string, @Body() body: any, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.update(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Delete("compliance/documents/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete compliance document" })
  @ApiOkResponse({ description: "Deleted" })
  async deleteComplianceDocument(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.complianceDocumentsUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("compliance/documents/:id/upload")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set file URL for a compliance document" })
  @ApiOkResponse({ description: "File URL updated" })
  async uploadComplianceDocument(@Param("id") id: string, @Body() body: { fileUrl: string; fileSize?: number }, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.setFileUrl(this.tenantIdFromRequest(req), id, body.fileUrl, body.fileSize ?? null);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("compliance/documents/:id/renew")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Renew a compliance document" })
  @ApiOkResponse({ description: "Document renewed" })
  async renewComplianceDocument(@Param("id") id: string, @Body() body: { expiryDate?: string; fileUrl?: string; fileSize?: number }, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.renew(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Patch("compliance/documents/:id/reminder")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set reminder days for a compliance document" })
  @ApiOkResponse({ description: "Reminder updated" })
  async setComplianceDocumentReminder(@Param("id") id: string, @Body() body: { reminderDays: number }, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.updateReminder(this.tenantIdFromRequest(req), id, body.reminderDays);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("compliance/reminders/send")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Send compliance reminder emails" })
  @ApiOkResponse({ description: "Reminders queued" })
  async sendComplianceReminders(@Req() req: FleetRequestContext) {
    const summary = await this.complianceDocumentsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: { queued: summary.expiringSoon + summary.expired, message: "Compliance reminder emails will be sent" } };
  }

  /* ── Fleet Financials ──────────────────────────────────────────────────── */

  @Post("financials/profitability")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Compute per-vehicle profitability" })
  @ApiOkResponse({ description: "Profitability array" })
  async computeProfitability(@Body() body: { periodMonths?: number }, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.computeProfitability(this.tenantIdFromRequest(req), body.periodMonths ?? 1);
    return { status: true, message: "success", data };
  }

  @Get("financials/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fleet financial summary" })
  @ApiOkResponse({ description: "Financial summary" })
  async getFinancialSummary(@Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("financials/configs")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "List financial configs" })
  @ApiOkResponse({ description: "Financial configs array" })
  async listFinancialConfigs(@Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.listConfigs(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("financials/configs/:vehicleId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Get financial config for a vehicle" })
  @ApiOkResponse({ description: "Financial config" })
  async getFinancialConfig(@Param("vehicleId") vehicleId: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.getConfig(this.tenantIdFromRequest(req), vehicleId);
    return { status: true, message: "success", data };
  }

  @Put("financials/configs/:vehicleId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Upsert financial config for a vehicle" })
  @ApiOkResponse({ description: "Config upserted" })
  async upsertFinancialConfig(@Param("vehicleId") vehicleId: string, @Body() body: any, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.upsertConfig(this.tenantIdFromRequest(req), vehicleId, body);
    return { status: true, message: "success", data };
  }

  @Get("financials/vehicle-pl/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Export vehicle P&L as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportVehiclePL(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.fleetFinancialsUseCase.exportVehiclePL(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicle-pl.csv");
    res.send(csv);
  }

  @Get("financials/cost-breakdown/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Export cost breakdown as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportCostBreakdown(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.fleetFinancialsUseCase.exportCostBreakdown(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=cost-breakdown.csv");
    res.send(csv);
  }

  /* ── Fuel Management Aliases (Phase 7) ─────────────────────────────────── */

  @Get("fuel/transactions")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "List fuel transactions (alias for /fuel/records)" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelRecordListResponse })
  async listFuelTransactions(
    @Query("vehicleId") vehicleId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordListResponse> {
    const records = await this.listFuelRecordsUseCase.execute({ tenantId: this.tenantIdFromRequest(req), vehicleId, from, to });
    return { status: true, message: "success", data: records.map((r) => r.toPrimitives()) } as unknown as FuelRecordListResponse;
  }

  @Get("fuel/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fuel summary stats" })
  @ApiOkResponse({ description: "Fuel summary" })
  async getFuelSummary(@Req() req: FleetRequestContext) {
    const records = await this.listFuelRecordsUseCase.execute({ tenantId: this.tenantIdFromRequest(req) });
    const primitives = records.map((r) => r.toPrimitives());
    const totalLitres = primitives.reduce((s, r) => s + r.liters, 0);
    const totalCostNgn = primitives.reduce((s, r) => s + r.totalCost, 0);
    const avgPrice = totalLitres > 0 ? totalCostNgn / totalLitres : 0;
    return {
      status: true, message: "success",
      data: {
        totalLitres: Math.round(totalLitres * 10) / 10,
        totalCostNgn: Math.round(totalCostNgn),
        avgPricePerLitre: Math.round(avgPrice * 10) / 10,
        transactionCount: primitives.length,
      },
    };
  }

  @Get("reports/delivery-metrics")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delivery metrics — I05" })
  @ApiOkResponse({ type: DeliveryMetricsResponse })
  async getDeliveryMetrics(@Req() req: FleetRequestContext): Promise<DeliveryMetricsResponse> {
    const data = await this.deliveryMetricsUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as DeliveryMetricsResponse;
  }

  @Get("reports/export/:entity")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @Header("Content-Type", "text/csv")
  @ApiOperation({ summary: "CSV export — I07" })
  @ApiOkResponse({ description: "CSV file", schema: { type: "string", format: "binary" } })
  async exportCsv(
    @Param("entity") entity: string,
    @Req() req: FleetRequestContext,
    @Res() res: any,
  ): Promise<void> {
    const validEntities: ExportEntity[] = ["jobs", "vehicles", "drivers", "alerts", "fuel"];
    if (!validEntities.includes(entity as ExportEntity)) {
      throw new BadRequestException(`entity must be one of: ${validEntities.join(", ")}`);
    }
    const csv = await this.exportUseCase.toCsv(entity as ExportEntity, this.tenantIdFromRequest(req));
    res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
    res.send(csv);
  }

  // ─── Fuel & Cost Management (Epic N) ───────────────────────────────────────

  @Post("fuel")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Record fuel transaction — N01" })
  @ApiCreatedResponse({ type: FuelRecordResponse })
  async recordFuel(
    @Body() dto: RecordFuelDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    const record = await this.recordFuelUseCase.execute({
      ...dto,
      tenantId: this.tenantIdFromRequest(req),
      recordedBy: req.user?.userId ?? "system",
    });
    const data = record.toPrimitives();
      await this.recordActivity(req, {
        entityType: "fuel",
        entityId: data.id,
        action: "fuel.recorded",
        summary: "Fuel transaction recorded",
        metadata: {
          vehicleId: data.vehicleId,
          driverId: data.driverId,
          liters: data.liters,
          totalCost: data.totalCost,
          station: data.station,
        },
      });
    return { status: true, message: "success", data: record.toPrimitives() };
  }

  @Get("fuel/metrics")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fuel consumption chart — N04" })
  @ApiQuery({ name: "period", required: false, enum: ["weekly", "monthly"] })
  @ApiOkResponse({ type: FuelConsumptionResponse })
  async fuelConsumption(@Query() query: FuelMetricsQueryDto, @Req() req: FleetRequestContext): Promise<FuelConsumptionResponse> {
    const buckets = await this.fuelMetricsUseCase.consumption(this.tenantIdFromRequest(req), query.period ?? "monthly");
    return { status: true, message: "success", data: buckets as ConsumptionBucketSchema[] };
  }

  @Get("fuel/efficiency")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Vehicle fuel efficiency — N05" })
  @ApiOkResponse({ type: FuelEfficiencyResponse })
  async fuelEfficiency(@Req() req: FleetRequestContext): Promise<FuelEfficiencyResponse> {
    const result = await this.fuelMetricsUseCase.efficiency(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: result as VehicleEfficiencySchema[] };
  }

  @Get("fuel/thresholds")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get fuel efficiency thresholds — N08" })
  @ApiOkResponse({ type: FuelThresholdListResponse })
  listFuelThresholds(): FuelThresholdListResponse {
    return { status: true, message: "success", data: this.fuelThresholdService.getAll() };
  }

  @Get("fuel/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @Header("Content-Type", "text/csv")
  @ApiOperation({ summary: "Export fuel transactions to CSV — N07" })
  @ApiOkResponse({ description: "CSV file", schema: { type: "string", format: "binary" } })
  async exportFuel(
    @Req() req: FleetRequestContext,
    @Res() res: any,
  ): Promise<void> {
    const csv = await this.exportUseCase.toCsv("fuel", this.tenantIdFromRequest(req));
    res.setHeader("Content-Disposition", `attachment; filename="fuel.csv"`);
    res.send(csv);
  }

  @Get("fuel")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List fuel transactions — N02" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "driverId", required: false, type: String })
  @ApiQuery({ name: "station", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelRecordListResponse })
  async listFuel(@Query() query: FuelListQueryDto, @Req() req: FleetRequestContext): Promise<FuelRecordListResponse> {
    const records = await this.listFuelRecordsUseCase.execute({ ...query, tenantId: this.tenantIdFromRequest(req) });
    return { status: true, message: "success", data: records.map((r) => r.toPrimitives()) };
  }

  @Patch("fuel/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({ summary: "Edit fuel transaction with audit trail — N03" })
  @ApiOkResponse({ type: FuelRecordResponse })
  async updateFuel(
    @Param("id") id: string,
    @Body() dto: UpdateFuelRecordDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    try {
      const record = await this.updateFuelRecordUseCase.execute({
        id,
        tenantId: this.tenantIdFromRequest(req),
        updatedBy: req.user?.userId ?? "system",
        ...dto,
      });
      const data = record.toPrimitives();
      await this.recordActivity(req, {
        entityType: "fuel",
        entityId: id,
        action: "fuel.updated",
        summary: "Fuel transaction updated",
        metadata: {
          vehicleId: data.vehicleId,
          driverId: data.driverId,
          liters: data.liters,
          totalCost: data.totalCost,
          station: data.station,
        },
      });
      return { status: true, message: "success", data: record.toPrimitives() };
    } catch (err) {
      if (err instanceof FuelRecordNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Delete("fuel/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({ summary: "Delete fuel transaction with audit trail — N03" })
  @ApiOkResponse({ description: "Deleted successfully" })
  async deleteFuel(
    @Param("id") id: string,
    @Req() req: FleetRequestContext,
  ): Promise<{ status: boolean; message: string }> {
    try {
      await this.deleteFuelRecordUseCase.execute(id, this.tenantIdFromRequest(req), req.user?.userId ?? "system");
      await this.recordActivity(req, {
        entityType: "fuel",
        entityId: id,
        action: "fuel.deleted",
        summary: "Fuel transaction deleted",
      });
      return { status: true, message: "deleted" };
    } catch (err) {
      if (err instanceof FuelRecordNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Put("fuel/thresholds/:vehicleType")
  @Roles(Role.ENTERPRISE_ADMIN)
  @ApiOperation({ summary: "Set fuel efficiency threshold by vehicle type — N08" })
  @ApiOkResponse({ type: FuelThresholdResponse })
  async setFuelThreshold(
    @Param("vehicleType") vehicleType: string,
    @Body() dto: FuelThresholdDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelThresholdResponse> {
    try {
      const threshold = this.fuelThresholdService.set(vehicleType, dto.minKmPerLiter);
      await this.recordActivity(req, {
        entityType: "fuel",
        entityId: vehicleType,
        action: "fuel.threshold.updated",
        summary: "Fuel efficiency threshold updated",
        metadata: {
          vehicleType,
          minKmPerLiter: dto.minKmPerLiter,
        },
      });
      return { status: true, message: "success", data: threshold };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Post("documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload document — J01" })
  @ApiCreatedResponse({ type: DocumentResponse })
  async uploadDocument(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
    @Query("docType") docType: string,
    @Query("uploadedBy") uploadedBy = "system",
    @Req() req: FleetRequestContext,
  ): Promise<DocumentResponse> {
    const validEntityTypes: EntityType[] = ["job", "vehicle", "driver"];
    const validDocTypes: DocumentType[] = ["pod", "invoice", "permit", "other"];
    if (!validEntityTypes.includes(entityType as EntityType)) throw new BadRequestException("invalid entityType");
    if (!validDocTypes.includes(docType as DocumentType)) throw new BadRequestException("invalid docType");
    if (!file) throw new BadRequestException("file is required");

    const doc = await this.uploadDocumentUseCase.execute({
      tenantId: this.tenantIdFromRequest(req),
      entityType: entityType as EntityType,
      entityId,
      docType: docType as DocumentType,
      filename: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
      uploadedBy: uploadedBy === "system" ? req.user?.userId ?? "system" : uploadedBy,
    });
    await this.recordActivity(req, {
      entityType: "document",
      entityId: doc.id,
      action: "document.uploaded",
      summary: "Document uploaded",
      metadata: {
        entityType,
        entityId,
        docType,
        filename: file.originalname,
      },
    });

    return { status: true, message: "uploaded", data: { ...doc.toPrimitives(), uploadedAt: doc.uploadedAt.toISOString(), expiresAt: doc.expiresAt?.toISOString() ?? null } } as unknown as DocumentResponse;
  }

  @Get("documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List documents for an entity — J01" })
  @ApiQuery({ name: "entityType", required: true, enum: ["job", "vehicle", "driver"] })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiOkResponse({ type: DocumentListResponse })
  async listDocuments(
    @Req() req: FleetRequestContext,
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
  ): Promise<DocumentListResponse> {
    const docs = await this.listDocumentsUseCase.execute(this.tenantIdFromRequest(req), entityType as EntityType, entityId);
    const data = docs.map((d) => ({ ...d.toPrimitives(), uploadedAt: d.uploadedAt.toISOString(), expiresAt: d.expiresAt?.toISOString() ?? null }));
    return { status: true, message: "success", data } as unknown as DocumentListResponse;
  }

  @Get("documents/:id/download-url")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER, "driver")
  @ApiOperation({ summary: "Get secure download URL — J02" })
  @ApiOkResponse({ type: DownloadUrlResponse })
  async getDocumentDownloadUrl(
    @Param("id") id: string,
    @Query("userId") userId = "system",
    @Req() req: FleetRequestContext,
  ): Promise<DownloadUrlResponse> {
    const result = await this.getDownloadUrlUseCase.execute(
      this.tenantIdFromRequest(req),
      id,
      userId == "system" ? req.user?.userId ?? "system" : userId,
      req.ip ?? "unknown",
    );
    return { status: true, message: "success", data: result } as unknown as DownloadUrlResponse;
  }

  @Get("documents/:id/access-log")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Document access log — J04" })
  @ApiOkResponse({ type: AccessLogListResponse })
  async getDocumentAccessLog(
    @Param("id") docId: string,
    @Req() req: FleetRequestContext,
  ): Promise<AccessLogListResponse> {
    const entries = await this.listAccessLogUseCase.execute(this.tenantIdFromRequest(req), docId);
    const data = entries.map((e) => ({ ...e, at: e.at.toISOString() }));
    return { status: true, message: "success", data } as unknown as AccessLogListResponse;
  }

  @Get("audit")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Activity/audit log — M06" })
  @ApiQuery({ name: "entityType", required: false, enum: ["job", "vehicle", "driver", "device", "fuel", "alert", "document", "geofence"] })
  @ApiQuery({ name: "entityId", required: false, type: String })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Audit entries (newest first)" })
  getAuditLog(
    @Req() req: FleetRequestContext,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string,
  ) {
    const entries = this.auditLog.query(this.tenantIdFromRequest(req), {
      entityType: entityType as AuditEntityType | undefined,
      entityId,
      action,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { status: true, message: "success", data: entries };
  }

  private async recordActivity(
    req: FleetRequestContext,
    activity: {
      entityType: AuditEntityType;
      entityId: string;
      action: string;
      summary: string;
      metadata?: Record<string, unknown>;
      service?: string;
      occurredAt?: string;
    },
  ): Promise<void> {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const actorId = req.user?.userId ?? "system";
      const actorRole = req.user?.role ?? "system";
      const occurredAt = activity.occurredAt ?? new Date().toISOString();
      const metadata = { ...(activity.metadata ?? {}) };

      this.auditLog.record({
        tenantId,
        entityType: activity.entityType,
        entityId: activity.entityId,
        action: activity.action,
        actorId,
        metadata,
        occurredAt,
      });

      await this.bus.publish(`tm.${tenantId}.activity.logged`, {
        id: randomUUID(),
        type: "activity.logged",
        version: 1,
        occurred_at: occurredAt,
        tenant_id: tenantId,
        actor: { id: actorId, role: actorRole },
        data: {
          service: activity.service ?? "fleet",
          action: activity.action,
          entity_type: activity.entityType,
          entity_id: activity.entityId,
          summary: activity.summary,
          metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `fleet_activity_log_failed:${activity.action}:${(error as Error).message}`,
      );
    }
  }

  private tenantIdFromRequest(req: FleetRequestContext): string {
    const tenantId = req.user?.tenantId?.trim();
    if (!tenantId) {
      throw new UnauthorizedException("Tenant context is missing from the access token");
    }
    return tenantId;
  }

  private parseOptionalBoolean(
    value: string | undefined,
    field: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    throw new BadRequestException(`${field} must be either "true" or "false"`);
  }

  private buildHealth(vehicle: { id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { imei: string } | null }) {
    const entry = this.vehicleHealthService.get(vehicle.id);
    const lastSeen = entry?.lastSeen ?? null;
    const deviceId = entry?.deviceId ?? vehicle.gpsDevice?.imei ?? null;
    const healthy = lastSeen !== null && Date.now() - lastSeen < HEALTH_THRESHOLD_MS;
    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      model: vehicle.model,
      assignedDriverId: vehicle.assignedDriverId,
      deviceId,
      lastSeen,
      healthy,
    };
  }

  private async runFleetUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof VehicleNotFoundError
        || error instanceof DriverNotFoundError
        || error instanceof DeviceNotFoundError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
