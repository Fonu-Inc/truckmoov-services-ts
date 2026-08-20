import { randomUUID } from "node:crypto";
import {
  Body,
  Res,
  Param,
  Inject,
  Get,
  Req,
  Patch,
  Delete,
  Controller,
  UseGuards,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  RequireIdempotency,
  Roles,
  Role,
  IdempotencyGuard,
  RolesGuard,
} from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { ListDevicesUseCase, ListVehicleTripsUseCase } from "./contexts/fleet/devices";
import {
  BulkImportVehiclesUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  DeleteVehicleUseCase,
  ListVehiclesUseCase,
  RegisterVehicleGpsDeviceUseCase,
  AssignDriverToVehicleUseCase,
  GetVehicleUseCase,
  CreateVehicleUseCase,
  UpdateVehicleUseCase,
} from "./contexts/fleet/vehicles";
import {
  VehicleSummaryResponse,
  VehicleDriverAssignmentResponse,
  NearestVehicleListResponse,
  VehicleResponse,
  BulkVehicleImportResponse,
  VehicleHealthResponse,
  VehicleHealthListResponse,
  VehicleListResponse,
} from "./dto/fleet.schema";
import {
  RegisterGpsDeviceDto,
  AssignDriverToVehicleDto,
  BulkImportVehiclesDto,
  SetVehicleStatusDto,
  UpdateVehicleDto,
  VehicleListQueryDto,
  CreateVehicleDto,
} from "./dto/vehicle.dto";
import { MaintenanceRecordsUseCase } from "./maintenance-records.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";
import { haversineKm } from "./utils/haversine";
import { VehicleHealthService } from "./vehicle-health.service";

@ApiTags("Vehicles")
@Controller("vehicles")
@TenantScoped()
@UseGuards(RolesGuard)
export class VehiclesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListVehiclesUseCase) private readonly listVehiclesUseCase: ListVehiclesUseCase,
    @Inject(ListDevicesUseCase) private readonly listDevicesUseCase: ListDevicesUseCase,
    @Inject(ListVehicleTripsUseCase) private readonly listVehicleTripsUseCase: ListVehicleTripsUseCase,
    @Inject(CreateVehicleUseCase) private readonly createVehicleUseCase: CreateVehicleUseCase,
    @Inject(GetVehicleUseCase) private readonly getVehicleUseCase: GetVehicleUseCase,
    @Inject(UpdateVehicleUseCase) private readonly updateVehicleUseCase: UpdateVehicleUseCase,
    @Inject(DeleteVehicleUseCase) private readonly deleteVehicleUseCase: DeleteVehicleUseCase,
    @Inject(AssignDriverToVehicleUseCase) private readonly assignDriverToVehicleUseCase: AssignDriverToVehicleUseCase,
    @Inject(UnassignDriverFromVehicleUseCase) private readonly unassignDriverFromVehicleUseCase: UnassignDriverFromVehicleUseCase,
    @Inject(SetVehicleStatusUseCase) private readonly setVehicleStatusUseCase: SetVehicleStatusUseCase,
    @Inject(RegisterVehicleGpsDeviceUseCase) private readonly registerVehicleGpsDeviceUseCase: RegisterVehicleGpsDeviceUseCase,
    @Inject(BulkImportVehiclesUseCase) private readonly bulkImportVehiclesUseCase: BulkImportVehiclesUseCase,
    @Inject(VehicleHealthService) private readonly vehicleHealthService: VehicleHealthService,
    @Inject(MaintenanceRecordsUseCase) private readonly maintenanceRecordsUseCase: MaintenanceRecordsUseCase,
  ) {
    super(auditLog, bus);
  }

  private readonly HEALTH_THRESHOLD_MS = Number(process.env["VEHICLE_HEALTH_THRESHOLD_MS"] ?? 300_000);

  @Get(":vehicleId/health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get last seen status" })
  @ApiOkResponse({ type: VehicleHealthResponse })
  async getVehicleHealth(@Param("vehicleId") vehicleId: string, @Req() req: FleetRequestContext) {
    const vehicle = await this.runFleetUseCase(() =>
      this.getVehicleUseCase.execute(vehicleId, this.tenantIdFromRequest(req)),
    );
    return { status: true, data: this.buildHealth(vehicle as never) };
  }

  @Get("health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List all last seen statuses" })
  @ApiOkResponse({ type: VehicleHealthListResponse })
  async listVehicleHealth(@Req() req: FleetRequestContext) {
    const vehicles = await this.listVehiclesUseCase.execute({ tenantId: this.tenantIdFromRequest(req) });
    const data = (vehicles as unknown as Array<{ id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { imei: string } | null }>)
      .map((v) => this.buildHealth(v));
    return { status: true, data };
  }

  @Get("nearest")
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

  @Get()
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

  @Get("summary")
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

  @Get("export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export vehicles as CSV", description: "Returns a CSV of all vehicles for the calling tenant." })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
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

  @Post()
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

  @Post("import")
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

  @Get(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Get vehicle by ID" })
  @ApiOkResponse({ type: VehicleResponse })
  async getVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicle = await this.runFleetUseCase(() => this.getVehicleUseCase.execute(id, tenantId));
    const [devices, maintenanceRecords, trips] = await Promise.all([
      this.listDevicesUseCase.execute({ tenantId, vehicleId: id }).catch(() => []),
      this.maintenanceRecordsUseCase.list(tenantId, { vehicleId: id }).catch(() => []),
      this.listVehicleTripsUseCase.execute(id, tenantId).catch(() => []),
    ]);
    return { ...vehicle, devices, maintenanceRecords, trips } as unknown as VehicleResponse;
  }

  /** Partially update a vehicle's details */

  @Patch(":id")
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

  @Patch(":id/status")
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
      this.setVehicleStatusUseCase.execute({ id, status: payload.status, tenantId: this.tenantIdFromRequest(req) }),
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

  @Patch(":id/assignment")
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
      this.assignDriverToVehicleUseCase.execute({
        vehicleId,
        driverId: payload.driverId,
        tenantId: this.tenantIdFromRequest(req),
      }),
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

  @Delete(":id/assignment")
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
      this.unassignDriverFromVehicleUseCase.execute(vehicleId, this.tenantIdFromRequest(req)),
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

  @Patch(":id/gps-device")
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
      this.registerVehicleGpsDeviceUseCase.execute({
        vehicleId,
        ...payload,
        tenantId: this.tenantIdFromRequest(req),
      }),
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

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async deleteVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id, this.tenantIdFromRequest(req)),
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

  private buildHealth(vehicle: { id: string; plateNumber: string; model: string; assignedDriverId: string | null; gpsDevice: { imei: string } | null }) {
    const entry = this.vehicleHealthService.get(vehicle.id);
    const lastSeen = entry?.lastSeen ?? null;
    const deviceId = entry?.deviceId ?? vehicle.gpsDevice?.imei ?? null;
    const healthy = lastSeen !== null && Date.now() - lastSeen < this.HEALTH_THRESHOLD_MS;
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
}
