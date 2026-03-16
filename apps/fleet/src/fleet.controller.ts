import {
  BadRequestException,
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
import { GeofenceService } from "@shared/geofence";
import { IdempotencyGuard, RequireIdempotency, Roles, RolesGuard } from "@shared/rbac";
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
  BulkImportVehiclesDto,
  CreateVehicleDto,
  DispatchSearchQueryDto,
  RegisterGpsDeviceDto,
  SetVehicleStatusDto,
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
  BulkVehicleImportResponse,
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
} from "./dto/fleet.schema";
import { haversineKm } from "./utils/haversine";
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
import type { AlertStatus } from "./contexts/fleet/alerts/domain/alert.entity";
import { DashboardUseCase, DeliveryMetricsUseCase, ExportUseCase, type ExportEntity } from "./contexts/fleet/reports";
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
  ListVehiclesUseCase,
  RegisterVehicleGpsDeviceUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  UpdateVehicleUseCase,
  VehicleNotFoundError,
} from "./contexts/fleet/vehicles";
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

@ApiTags("Fleet")
@Controller("fleet")
@UseGuards(RolesGuard)
export class FleetController {
  private readonly logger = new Logger(FleetController.name);
  constructor(
    @Inject(ListVehiclesUseCase)
    private readonly listVehiclesUseCase: ListVehiclesUseCase,
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
  ) {}

  /** Health check */
  @Get("health")
  health(): FleetHealthResponse {
    return { status: true, message: "success", data: { service: "fleet" } };
  }

  /** Readiness probe — L14 */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  ready(): { ready: boolean } {
    return { ready: true };
  }

  @Get("test-sentry")
  @ApiOperation({
    summary: "Trigger a test Sentry error",
    description: "Throws an unhandled error so Sentry capture can be verified.",
  })
  testSentry(): never {
    throw new Error("Sentry test error from fleet service");
  }

  @Post("routes/:vehicleId/geofence")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({
    summary: "Register a geofence",
    description: "Stores a bounding box for a vehicle so we can detect deviations.",
  })
  @ApiCreatedResponse({ description: "Geofence stored" })
  async setGeofence(
    @Param("vehicleId") vehicleId: string,
    @Body() payload: SetGeofenceDto,
  ) {
    this.geofenceService.set(vehicleId, {
      northeast: { lat: payload.northeast.lat, lng: payload.northeast.lng },
      southwest: { lat: payload.southwest.lat, lng: payload.southwest.lng },
    });
    return { status: true, message: "geofence registered" };
  }

  @Get("routes/:vehicleId/geofence")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Read the configured geofence" })
  @ApiOkResponse({ description: "Current bounding box" })
  async getGeofence(@Param("vehicleId") vehicleId: string) {
    return { status: true, geofence: this.geofenceService.get(vehicleId) };
  }

  @Post("routes/:vehicleId/location")
  @Roles("admin", "fleet_manager", "dispatcher", "operations_manager")
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
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Get last seen status" })
  @ApiOkResponse({ type: VehicleHealthResponse })
  async getVehicleHealth(@Param("vehicleId") vehicleId: string) {
    const vehicle = await this.runFleetUseCase(() => this.getVehicleUseCase.execute(vehicleId));
    return { status: true, data: this.buildHealth(vehicle as never) };
  }

  @Get("vehicles/health")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "List all last seen statuses" })
  @ApiOkResponse({ type: VehicleHealthListResponse })
  async listVehicleHealth() {
    const vehicles = await this.listVehiclesUseCase.execute();
    const data = (vehicles as unknown as Array<{ id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { deviceId: string } | null }>)
      .map((v) => this.buildHealth(v));
    return { status: true, data };
  }

  @Get("vehicles/nearest")
  @Roles("admin", "fleet_manager", "operations_manager", "dispatcher")
  @ApiOperation({ summary: "Find nearest vehicles to a coordinate" })
  @ApiQuery({ name: "lat", required: true, type: Number })
  @ApiQuery({ name: "lng", required: true, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: NearestVehicleListResponse })
  async nearestVehicles(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("limit") limit = "5",
  ): Promise<NearestVehicleListResponse> {
    const originLat = parseFloat(lat);
    const originLng = parseFloat(lng);
    const maxResults = parseInt(limit, 10) || 5;

    const vehicles = await this.listVehiclesUseCase.execute() as unknown as Array<{
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
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List vehicles",
    description: "Epic C (US-C01, US-C04, US-C06): list/search/filter fleet vehicles.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: VehicleListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listVehicles(@Query() query: VehicleListQueryDto): Promise<VehicleListResponse> {
    return this.listVehiclesUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: query.tenantId,
    }) as unknown as Promise<VehicleListResponse>;
  }

  /** Register a new vehicle in the fleet */
  @Post("vehicles")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create vehicle",
    description: "Epic C (US-C01): create a new fleet vehicle.",
  })
  @ApiCreatedResponse({ type: VehicleResponse })
  async createVehicle(@Body() payload: CreateVehicleDto): Promise<VehicleResponse> {
    return this.createVehicleUseCase.execute(payload) as unknown as Promise<VehicleResponse>;
  }

  /** Bulk onboarding for fleet inventory imports */
  @Post("vehicles/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import vehicles",
    description: "Epic C (US-C05): bulk upsert vehicles by plate number.",
  })
  @ApiCreatedResponse({ type: BulkVehicleImportResponse })
  async bulkImportVehicles(@Body() payload: BulkImportVehiclesDto): Promise<BulkVehicleImportResponse> {
    return this.bulkImportVehiclesUseCase.execute(payload) as unknown as Promise<BulkVehicleImportResponse>;
  }

  /** Retrieve a vehicle by ID */
  @Get("vehicles/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({ summary: "Get vehicle by ID" })
  @ApiOkResponse({ type: VehicleResponse })
  async getVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() => this.getVehicleUseCase.execute(id)) as unknown as Promise<VehicleResponse>;
  }

  /** Partially update a vehicle's details */
  @Patch("vehicles/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async updateVehicle(@Param("id") id: string, @Body() payload: UpdateVehicleDto): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.updateVehicleUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Activate/deactivate vehicle availability for dispatch */
  @Patch("vehicles/:id/status")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set vehicle status",
    description: "Epic C (US-C04): activate/deactivate vehicle availability.",
  })
  @ApiOkResponse({ type: VehicleResponse })
  async setVehicleStatus(@Param("id") id: string, @Body() payload: SetVehicleStatusDto): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.setVehicleStatusUseCase.execute({ id, status: payload.status }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Assign a driver to a vehicle (US-C03) */
  @Patch("vehicles/:id/assignment")
  @Roles("admin", "fleet_manager", "dispatcher")
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
  ): Promise<VehicleDriverAssignmentResponse> {
    return this.runFleetUseCase(() =>
      this.assignDriverToVehicleUseCase.execute({ vehicleId, driverId: payload.driverId }),
    ) as unknown as Promise<VehicleDriverAssignmentResponse>;
  }

  /** Remove current driver assignment from a vehicle */
  @Delete("vehicles/:id/assignment")
  @Roles("admin", "fleet_manager", "dispatcher")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Unassign driver from vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async unassignDriverFromVehicle(@Param("id") vehicleId: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.unassignDriverFromVehicleUseCase.execute(vehicleId),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Register or replace GPS hardware mapped to a vehicle */
  @Patch("vehicles/:id/gps-device")
  @Roles("admin", "fleet_manager")
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
  ): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.registerVehicleGpsDeviceUseCase.execute({ vehicleId, ...payload }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Remove a vehicle from the fleet */
  @Delete("vehicles/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async deleteVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Retrieve drivers with optional dispatch-centric filters */
  @Get("drivers")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List drivers",
    description: "Epic C (US-C02, US-C04, US-C06): list/search/filter drivers.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DriverListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listDrivers(@Query() query: DriverListQueryDto): Promise<DriverListResponse> {
    return this.listDriversUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: query.tenantId,
    }) as unknown as Promise<DriverListResponse>;
  }

  /** Register a new driver */
  @Post("drivers")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create driver",
    description: "Epic C (US-C02): create a new driver record.",
  })
  @ApiCreatedResponse({ type: DriverResponse })
  async createDriver(@Body() payload: CreateDriverDto): Promise<DriverResponse> {
    return this.createDriverUseCase.execute(payload) as unknown as Promise<DriverResponse>;
  }

  /** Bulk onboarding for driver records */
  @Post("drivers/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import drivers",
    description: "Epic C (US-C05): bulk upsert drivers by license number.",
  })
  @ApiCreatedResponse({ type: BulkDriverImportResponse })
  async bulkImportDrivers(@Body() payload: BulkImportDriversDto): Promise<BulkDriverImportResponse> {
    return this.bulkImportDriversUseCase.execute(payload) as unknown as Promise<BulkDriverImportResponse>;
  }

  /** Retrieve a driver by ID */
  @Get("drivers/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({ summary: "Get driver by ID" })
  @ApiOkResponse({ type: DriverResponse })
  async getDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() => this.getDriverUseCase.execute(id)) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */
  @Patch("drivers/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update driver" })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriver(@Param("id") id: string, @Body() payload: UpdateDriverDto): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.updateDriverUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Activate/deactivate driver availability for dispatch */
  @Patch("drivers/:id/status")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set driver status",
    description: "Epic C (US-C04): activate/deactivate driver availability.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async setDriverStatus(@Param("id") id: string, @Body() payload: SetDriverStatusDto): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.setDriverStatusUseCase.execute({ id, status: payload.status }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Manage WhatsApp/SMS/voice contact channels used for dispatch communication */
  @Patch("drivers/:id/contact-channels")
  @Roles("admin", "fleet_manager", "dispatcher")
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
  ): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.updateDriverContactChannelsUseCase.execute({ id, channels: payload }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Remove a driver record */
  @Delete("drivers/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete driver" })
  @ApiOkResponse({ type: DriverResponse })
  async deleteDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.deleteDriverUseCase.execute(id),
    ) as unknown as Promise<DriverResponse>;
  }

  /** List jobs for dispatch search/filter use-cases */
  @Get("jobs")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List jobs",
    description: "Epic C (US-C06): filter/search jobs for dispatch views.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: JobListResponse })
  async listJobs(@Query() query: JobListQueryDto): Promise<JobListResponse> {
    return this.listJobsUseCase.execute({
      query: query.query,
      status: query.status,
      tenantId: query.tenantId,
    }) as unknown as Promise<JobListResponse>;
  }

  /** Combined dispatcher search over vehicles, drivers, and jobs */
  @Get("dispatch/search")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "Dispatch search",
    description: "Epic C (US-C06): combined search/filter over vehicles, drivers, and jobs.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "driverStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "jobStatus", required: false, type: String })
  @ApiQuery({ name: "assignedOnly", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DispatchSearchResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async searchDispatch(@Query() query: DispatchSearchQueryDto): Promise<DispatchSearchResponse> {
    const assignedOnly = this.parseOptionalBoolean(query.assignedOnly, "assignedOnly");

    // Run in parallel because this endpoint is read-only aggregation across three repositories.
    const [vehicles, drivers, jobs] = await Promise.all([
      this.listVehiclesUseCase.execute({
        query: query.query,
        status: query.vehicleStatus,
        assigned: assignedOnly,
        tenantId: query.tenantId,
      }),
      this.listDriversUseCase.execute({
        query: query.query,
        status: query.driverStatus,
        assigned: assignedOnly,
        tenantId: query.tenantId,
      }),
      this.listJobsUseCase.execute({
        query: query.query,
        status: query.jobStatus,
        tenantId: query.tenantId,
      }),
    ]);

    return { vehicles, drivers, jobs } as unknown as DispatchSearchResponse;
  }

  /** Emit a job-status-changed domain event to the event bus */
  @Post("events/job-status")
  @Roles("admin", "fleet_manager", "dispatcher")
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
    @Query("tenant") tenant?: string,
  ): Promise<JobStatusResponse> {
    return this.publishJobStatusChangedUseCase.execute({
      jobId,
      status,
      tenantId: tenant,
    }) as unknown as Promise<JobStatusResponse>;
  }

  @Get("alerts/stats")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Alert statistics — H06" })
  @ApiOkResponse({ type: AlertStatsResponse })
  async getAlertStats(@Query("tenantId") tenantId = "default"): Promise<AlertStatsResponse> {
    const data = await this.getAlertStatsUseCase.execute(tenantId);
    return { status: true, message: "success", data } as unknown as AlertStatsResponse;
  }

  @Get("alerts")
  @Roles("admin", "fleet_manager", "operations_manager", "dispatcher")
  @ApiOperation({ summary: "List alerts — H04" })
  @ApiQuery({ name: "status", required: false, enum: ["open", "acknowledged", "resolved", "escalated"] })
  @ApiQuery({ name: "type", required: false, type: String })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: AlertListResponse })
  async listAlerts(
    @Query("tenantId") tenantId = "default",
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("vehicleId") vehicleId?: string,
  ): Promise<AlertListResponse> {
    const alerts = await this.listAlertsUseCase.execute(tenantId, {
      status: status as AlertStatus | undefined,
      type,
      vehicleId,
    });
    const data = alerts.map((a) => ({ ...a.toPrimitives(), triggeredAt: a.triggeredAt.toISOString(), acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null, resolvedAt: a.resolvedAt?.toISOString() ?? null, escalatedAt: a.escalatedAt?.toISOString() ?? null }));
    return { status: true, message: "success", data } as unknown as AlertListResponse;
  }

  @Post("alerts/:id/acknowledge")
  @Roles("admin", "fleet_manager", "dispatcher")
  @ApiOperation({ summary: "Acknowledge alert — H04" })
  @ApiOkResponse({ type: AlertResponse })
  async acknowledgeAlert(
    @Param("id") id: string,
    @Query("tenantId") tenantId = "default",
    @Query("by") by = "system",
  ): Promise<AlertResponse> {
    try {
      const alert = await this.acknowledgeAlertUseCase.execute(tenantId, id, by);
      return { status: true, message: "success", data: alert.toPrimitives() } as unknown as AlertResponse;
    } catch (e) {
      if (e instanceof AlertNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Post("alerts/:id/resolve")
  @Roles("admin", "fleet_manager", "dispatcher")
  @ApiOperation({ summary: "Resolve alert — H04" })
  @ApiOkResponse({ type: AlertResponse })
  async resolveAlert(
    @Param("id") id: string,
    @Query("tenantId") tenantId = "default",
    @Query("by") by = "system",
  ): Promise<AlertResponse> {
    try {
      const alert = await this.resolveAlertUseCase.execute(tenantId, id, by);
      return { status: true, message: "success", data: alert.toPrimitives() } as unknown as AlertResponse;
    } catch (e) {
      if (e instanceof AlertNotFoundError) throw new NotFoundException(e.message);
      throw e;
    }
  }

  @Get("reports/dashboard")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Operational dashboard — I01" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DashboardResponse })
  async getDashboard(@Query("tenantId") tenantId = "default"): Promise<DashboardResponse> {
    const data = await this.dashboardUseCase.execute(tenantId);
    return { status: true, message: "success", data } as unknown as DashboardResponse;
  }

  @Get("reports/delivery-metrics")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Delivery metrics — I05" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DeliveryMetricsResponse })
  async getDeliveryMetrics(@Query("tenantId") tenantId = "default"): Promise<DeliveryMetricsResponse> {
    const data = await this.deliveryMetricsUseCase.execute(tenantId);
    return { status: true, message: "success", data } as unknown as DeliveryMetricsResponse;
  }

  @Get("reports/export/:entity")
  @Roles("admin", "fleet_manager", "operations_manager")
  @Header("Content-Type", "text/csv")
  @ApiOperation({ summary: "CSV export — I07" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  async exportCsv(
    @Param("entity") entity: string,
    @Query("tenantId") tenantId = "default",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Res() res: any,
  ): Promise<void> {
    const validEntities: ExportEntity[] = ["jobs", "vehicles", "drivers", "alerts", "fuel"];
    if (!validEntities.includes(entity as ExportEntity)) {
      throw new BadRequestException(`entity must be one of: ${validEntities.join(", ")}`);
    }
    const csv = await this.exportUseCase.toCsv(entity as ExportEntity, tenantId);
    res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
    res.send(csv);
  }

  // ─── Fuel & Cost Management (Epic N) ───────────────────────────────────────

  @Post("fuel")
  @Roles("admin", "fleet_manager", "dispatcher")
  @ApiOperation({ summary: "Record fuel transaction — N01" })
  @ApiCreatedResponse({ type: FuelRecordResponse })
  async recordFuel(
    @Body() dto: RecordFuelDto,
    @Req() req: { user?: { userId?: string } },
  ): Promise<FuelRecordResponse> {
    const record = await this.recordFuelUseCase.execute({
      ...dto,
      recordedBy: req.user?.userId ?? "system",
    });
    return { status: true, message: "success", data: record.toPrimitives() };
  }

  @Get("fuel/metrics")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Fuel consumption chart — N04" })
  @ApiQuery({ name: "period", required: false, enum: ["weekly", "monthly"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: FuelConsumptionResponse })
  async fuelConsumption(@Query() query: FuelMetricsQueryDto): Promise<FuelConsumptionResponse> {
    const buckets = await this.fuelMetricsUseCase.consumption(query.tenantId, query.period ?? "monthly");
    return { status: true, message: "success", data: buckets as ConsumptionBucketSchema[] };
  }

  @Get("fuel/efficiency")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Vehicle fuel efficiency — N05" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: FuelEfficiencyResponse })
  async fuelEfficiency(@Query("tenantId") tenantId?: string): Promise<FuelEfficiencyResponse> {
    const result = await this.fuelMetricsUseCase.efficiency(tenantId);
    return { status: true, message: "success", data: result as VehicleEfficiencySchema[] };
  }

  @Get("fuel/thresholds")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Get fuel efficiency thresholds — N08" })
  @ApiOkResponse({ type: FuelThresholdListResponse })
  listFuelThresholds(): FuelThresholdListResponse {
    return { status: true, message: "success", data: this.fuelThresholdService.getAll() };
  }

  @Get("fuel/export")
  @Roles("admin", "fleet_manager", "operations_manager")
  @Header("Content-Type", "text/csv")
  @ApiOperation({ summary: "Export fuel transactions to CSV — N07" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  async exportFuel(
    @Query("tenantId") tenantId = "default",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Res() res: any,
  ): Promise<void> {
    const csv = await this.exportUseCase.toCsv("fuel", tenantId);
    res.setHeader("Content-Disposition", `attachment; filename="fuel.csv"`);
    res.send(csv);
  }

  @Get("fuel")
  @Roles("admin", "fleet_manager", "dispatcher", "operations_manager")
  @ApiOperation({ summary: "List fuel transactions — N02" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "driverId", required: false, type: String })
  @ApiQuery({ name: "station", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelRecordListResponse })
  async listFuel(@Query() query: FuelListQueryDto): Promise<FuelRecordListResponse> {
    const records = await this.listFuelRecordsUseCase.execute(query);
    return { status: true, message: "success", data: records.map((r) => r.toPrimitives()) };
  }

  @Patch("fuel/:id")
  @Roles("admin", "fleet_manager")
  @ApiOperation({ summary: "Edit fuel transaction with audit trail — N03" })
  @ApiOkResponse({ type: FuelRecordResponse })
  async updateFuel(
    @Param("id") id: string,
    @Query("tenantId") tenantId = "default",
    @Body() dto: UpdateFuelRecordDto,
    @Req() req: { user?: { userId?: string } },
  ): Promise<FuelRecordResponse> {
    try {
      const record = await this.updateFuelRecordUseCase.execute({
        id,
        tenantId,
        updatedBy: req.user?.userId ?? "system",
        ...dto,
      });
      return { status: true, message: "success", data: record.toPrimitives() };
    } catch (err) {
      if (err instanceof FuelRecordNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Delete("fuel/:id")
  @Roles("admin", "fleet_manager")
  @ApiOperation({ summary: "Delete fuel transaction with audit trail — N03" })
  async deleteFuel(
    @Param("id") id: string,
    @Query("tenantId") tenantId = "default",
    @Req() req: { user?: { userId?: string } },
  ): Promise<{ status: boolean; message: string }> {
    try {
      await this.deleteFuelRecordUseCase.execute(id, tenantId, req.user?.userId ?? "system");
      return { status: true, message: "deleted" };
    } catch (err) {
      if (err instanceof FuelRecordNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Put("fuel/thresholds/:vehicleType")
  @Roles("admin")
  @ApiOperation({ summary: "Set fuel efficiency threshold by vehicle type — N08" })
  @ApiOkResponse({ type: FuelThresholdResponse })
  setFuelThreshold(
    @Param("vehicleType") vehicleType: string,
    @Body() dto: FuelThresholdDto,
  ): FuelThresholdResponse {
    try {
      const threshold = this.fuelThresholdService.set(vehicleType, dto.minKmPerLiter);
      return { status: true, message: "success", data: threshold };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Post("documents")
  @Roles("admin", "fleet_manager", "dispatcher", "operations_manager")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload document — J01" })
  @ApiCreatedResponse({ type: DocumentResponse })
  async uploadDocument(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Query("tenantId") tenantId = "default",
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
    @Query("docType") docType: string,
    @Query("uploadedBy") uploadedBy = "system",
  ): Promise<DocumentResponse> {
    const validEntityTypes: EntityType[] = ["job", "vehicle", "driver"];
    const validDocTypes: DocumentType[] = ["pod", "invoice", "permit", "other"];
    if (!validEntityTypes.includes(entityType as EntityType)) throw new BadRequestException("invalid entityType");
    if (!validDocTypes.includes(docType as DocumentType)) throw new BadRequestException("invalid docType");
    if (!file) throw new BadRequestException("file is required");

    const doc = await this.uploadDocumentUseCase.execute({
      tenantId,
      entityType: entityType as EntityType,
      entityId,
      docType: docType as DocumentType,
      filename: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
      uploadedBy,
    });

    return { status: true, message: "uploaded", data: { ...doc.toPrimitives(), uploadedAt: doc.uploadedAt.toISOString(), expiresAt: doc.expiresAt?.toISOString() ?? null } } as unknown as DocumentResponse;
  }

  @Get("documents")
  @Roles("admin", "fleet_manager", "dispatcher", "operations_manager")
  @ApiOperation({ summary: "List documents for an entity — J01" })
  @ApiQuery({ name: "entityType", required: true, enum: ["job", "vehicle", "driver"] })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DocumentListResponse })
  async listDocuments(
    @Query("tenantId") tenantId = "default",
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
  ): Promise<DocumentListResponse> {
    const docs = await this.listDocumentsUseCase.execute(tenantId, entityType as EntityType, entityId);
    const data = docs.map((d) => ({ ...d.toPrimitives(), uploadedAt: d.uploadedAt.toISOString(), expiresAt: d.expiresAt?.toISOString() ?? null }));
    return { status: true, message: "success", data } as unknown as DocumentListResponse;
  }

  @Get("documents/:id/download-url")
  @Roles("admin", "fleet_manager", "dispatcher", "operations_manager", "driver")
  @ApiOperation({ summary: "Get secure download URL — J02" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DownloadUrlResponse })
  async getDocumentDownloadUrl(
    @Param("id") id: string,
    @Query("tenantId") tenantId = "default",
    @Query("userId") userId = "system",
    @Req() req: { ip?: string },
  ): Promise<DownloadUrlResponse> {
    const result = await this.getDownloadUrlUseCase.execute(tenantId, id, userId, req.ip ?? "unknown");
    return { status: true, message: "success", data: result } as unknown as DownloadUrlResponse;
  }

  @Get("documents/:id/access-log")
  @Roles("admin", "operations_manager")
  @ApiOperation({ summary: "Document access log — J04" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: AccessLogListResponse })
  async getDocumentAccessLog(
    @Param("id") docId: string,
    @Query("tenantId") tenantId = "default",
  ): Promise<AccessLogListResponse> {
    const entries = await this.listAccessLogUseCase.execute(tenantId, docId);
    const data = entries.map((e) => ({ ...e, at: e.at.toISOString() }));
    return { status: true, message: "success", data } as unknown as AccessLogListResponse;
  }

  @Get("audit")
  @Roles("admin", "fleet_manager", "operations_manager")
  @ApiOperation({ summary: "Activity/audit log — M06" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({ name: "entityType", required: false, enum: ["job", "vehicle", "driver", "alert", "document", "geofence"] })
  @ApiQuery({ name: "entityId", required: false, type: String })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Audit entries (newest first)" })
  getAuditLog(
    @Query("tenantId") tenantId = "default",
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string,
  ) {
    const entries = this.auditLog.query(tenantId, {
      entityType: entityType as AuditEntityType | undefined,
      entityId,
      action,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { status: true, message: "success", data: entries };
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

  private buildHealth(vehicle: { id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { deviceId: string } | null }) {
    const entry = this.vehicleHealthService.get(vehicle.id);
    const lastSeen = entry?.lastSeen ?? null;
    const deviceId = entry?.deviceId ?? vehicle.gpsDevice?.deviceId ?? null;
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
      if (error instanceof VehicleNotFoundError || error instanceof DriverNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
