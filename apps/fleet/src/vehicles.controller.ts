import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Res,
  Param,
  Inject,
  Get,
  Headers,
  Req,
  Patch,
  Delete,
  Controller,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Post,
  Query,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from "@shared/http";
import {
  ApiBody,
  ApiConsumes,
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
import { ListFuelRecordsUseCase } from "./contexts/fleet/fuel";
import { ComplianceDocumentsUseCase } from "./compliance-documents.use-case";
import { FleetFinancialsUseCase } from "./fleet-financials.use-case";
import { FleetAnalyticsUseCase } from "./fleet-analytics.use-case";
import {
  resolveVehicleTab,
  VEHICLE_TAB_HEADER,
  type VehicleTab,
} from "./contexts/fleet/vehicles/domain/vehicle-tabs";
import {
  applyFuelFilters,
  type FuelRecordView,
} from "./contexts/fleet/fuel/domain/fuel-analytics";
import {
  normalizeCapacityUnit,
  VEHICLE_CAPACITY_UNITS,
  VEHICLE_CAPACITY_UNIT_LABELS,
} from "./contexts/fleet/vehicles/domain/vehicle-capacity";
import {
  buildVehicleCsvExport,
  buildVehicleCsvTemplate,
  parseVehicleCsv,
  VEHICLE_CSV_COLUMNS,
} from "./contexts/fleet/vehicles/domain/vehicle-csv";
import {
  VEHICLE_QUOTA_READER,
  type VehicleQuotaReader,
} from "./contexts/fleet/vehicles/domain/ports/vehicle-quota-reader.port";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { ListDevicesUseCase, ListVehicleTripsUseCase } from "./contexts/fleet/devices";
import { Portals, OnResource, Requires } from "@shared/access";
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
  VehicleQuotaExceededError,
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
import {
  VEHICLE_POSITION_REPOSITORY,
  type VehiclePosition,
  type VehiclePositionRepository,
} from "./contexts/fleet/tracking/domain/vehicle-position.repository";

function isCoordinate({ lat, lng }: { lat: number; lng: number }): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

type HealthVehicle = {
  id: string;
  plateNumber: string;
  model: string;
  assignedDriverId: string | null;
  gpsDevice?: { imei: string } | null;
};

@ApiTags("Vehicles")
@Portals("tenant")
@OnResource("tenant.vehicles")
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
    @Inject(VEHICLE_POSITION_REPOSITORY) private readonly positions: VehiclePositionRepository,
    @Inject(MaintenanceRecordsUseCase) private readonly maintenanceRecordsUseCase: MaintenanceRecordsUseCase,
    @Inject(VEHICLE_QUOTA_READER) private readonly vehicleQuotaReader: VehicleQuotaReader,
    @Inject(ListFuelRecordsUseCase) private readonly listFuelRecordsUseCase: ListFuelRecordsUseCase,
    @Inject(ComplianceDocumentsUseCase) private readonly complianceDocumentsUseCase: ComplianceDocumentsUseCase,
    @Inject(FleetFinancialsUseCase) private readonly fleetFinancialsUseCase: FleetFinancialsUseCase,
    @Inject(FleetAnalyticsUseCase) private readonly fleetAnalyticsUseCase: FleetAnalyticsUseCase,
  ) {
    super(auditLog, bus);
  }

  private readonly HEALTH_THRESHOLD_MS = Number(process.env["VEHICLE_HEALTH_THRESHOLD_MS"] ?? 300_000);

  @Get(":vehicleId/health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get last seen status" })
  @ApiOkResponse({ type: VehicleHealthResponse })
  async getVehicleHealth(@Param("vehicleId") vehicleId: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicle = (await this.runFleetUseCase(() =>
      this.getVehicleUseCase.execute(vehicleId, tenantId),
    )) as unknown as HealthVehicle;
    const positions = await this.positions.findByVehicleIds(tenantId, [vehicle.id]);
    return { status: true, data: this.buildHealth(vehicle, positions.get(vehicle.id)) };
  }

  @Get("health")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List all last seen statuses" })
  @ApiOkResponse({ type: VehicleHealthListResponse })
  async listVehicleHealth(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicles = (await this.listVehiclesUseCase.execute({ tenantId })) as unknown as HealthVehicle[];
    const positions = await this.positions.findByVehicleIds(tenantId, vehicles.map((v) => v.id));
    const data = vehicles.map((v) => this.buildHealth(v, positions.get(v.id)));
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
    const origin = { lat: parseFloat(lat), lng: parseFloat(lng) };
    if (!isCoordinate(origin)) throw new BadRequestException("lat and lng must be a valid coordinate");
    const maxResults = parseInt(limit, 10) || 5;
    const tenantId = this.tenantIdFromRequest(req);

    const vehicles = (await this.listVehiclesUseCase.execute({ tenantId })) as unknown as HealthVehicle[];
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    const nearest = await this.positions.nearest(tenantId, origin, [...byId.keys()], maxResults);

    const data = nearest.map((position) => {
      const v = byId.get(position.vehicleId)!;
      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        model: v.model,
        assignedDriverId: v.assignedDriverId,
        lat: position.lat,
        lng: position.lng,
        distanceKm: position.distanceKm,
      };
    });

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
  async listVehicles(
    @Query() query: VehicleListQueryDto,
    @Req() req: FleetRequestContext,
    @Headers(VEHICLE_TAB_HEADER) tabs?: string,
  ): Promise<VehicleListResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const tab = resolveVehicleTab(tabs);

    // The My Vehicles page is one screen with several tabs. The header picks
    // which tab's summary and list this call returns, defaulting to the
    // vehicles list so callers that send no header see what they always did.
    if (tab !== "vehicles") {
      return {
        status: true,
        message: "success",
        tab,
        data: await this.buildTabPayload(tab, tenantId, query, await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req)),
      } as unknown as VehicleListResponse;
    }

    const vehicles = await this.listVehiclesUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId,
      ownerOperatorId: this.ownerOperatorIdFromRequest(req),
      type: query.type,
      yearFrom: query.yearFrom ? parseInt(query.yearFrom, 10) : undefined,
      yearTo: query.yearTo ? parseInt(query.yearTo, 10) : undefined,
    });
    return { status: true, message: "success", tab, data: vehicles } as unknown as VehicleListResponse;
  }

  /**
   * An import matches existing vehicles by registration and updates them, so an
   * owner operator's file must not name a vehicle that belongs to someone else on
   * the account. Checked before anything is written, and refused as a whole.
   */
  private async assertImportTouchesOnlyOwnVehicles(
    rows: Array<{ registrationNumber: string }>,
    tenantId: string,
    ownerOperatorId: string | undefined,
  ): Promise<void> {
    if (!ownerOperatorId) return;

    const everyone = (await this.listVehiclesUseCase.execute({ tenantId })) as unknown as Array<{
      registrationNumber?: string;
      plateNumber?: string;
      ownerOperatorId: string | null;
    }>;
    const notTheirs = new Set(
      everyone
        .filter((vehicle) => vehicle.ownerOperatorId !== ownerOperatorId)
        .map((vehicle) => (vehicle.registrationNumber ?? vehicle.plateNumber ?? "").toUpperCase()),
    );
    const clash = rows.find((row) => notTheirs.has(row.registrationNumber.toUpperCase()));
    if (clash) {
      throw new ConflictException({
        message: `${clash.registrationNumber} is already on this account and is not one of your vehicles`,
        field: "file",
      });
    }
  }

  private async buildTabPayload(
    tab: Exclude<VehicleTab, "vehicles">,
    tenantId: string,
    query: VehicleListQueryDto,
    ownedVehicleIds: ReadonlySet<string> | null,
  ): Promise<Record<string, unknown>> {
    switch (tab) {
      case "maintenance": {
        const [summary, records] = await Promise.all([
          this.maintenanceRecordsUseCase.summary(tenantId, ownedVehicleIds),
          this.maintenanceRecordsUseCase.list(tenantId, { search: query.query }, ownedVehicleIds),
        ]);
        return { summary, items: records };
      }
      case "fuel": {
        const records = await this.listFuelRecordsUseCase.execute({ tenantId });
        const visible = ownedVehicleIds
          ? (records as unknown as Array<FuelRecordView & { vehicleId: string }>).filter((record) =>
              ownedVehicleIds.has(record.vehicleId),
            )
          : (records as unknown as FuelRecordView[]);
        const filtered = applyFuelFilters(visible, {
          query: query.query,
        });
        const totalLitres = filtered.reduce((sum, record) => sum + record.liters, 0);
        const totalCostNgn = filtered.reduce((sum, record) => sum + record.totalCost, 0);
        return {
          summary: {
            totalLitres: Math.round(totalLitres * 10) / 10,
            totalCostNgn: Math.round(totalCostNgn),
            avgPricePerLitre: totalLitres > 0 ? Math.round((totalCostNgn / totalLitres) * 10) / 10 : 0,
            transactionCount: filtered.length,
          },
          items: filtered,
        };
      }
      case "compliance": {
        const [summary, documents] = await Promise.all([
          this.complianceDocumentsUseCase.summary(tenantId),
          this.complianceDocumentsUseCase.list(tenantId, { search: query.query }),
        ]);
        return { summary, items: documents };
      }
      case "financials": {
        const summary = await this.fleetFinancialsUseCase.summary(tenantId);
        return { summary };
      }
      case "analytics": {
        const summary = await this.fleetAnalyticsUseCase.summary(tenantId, 30);
        return { summary };
      }
    }
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Vehicle summary stats", description: "Returns count of vehicles grouped by status for the calling tenant." })
  @ApiOkResponse({ type: VehicleSummaryResponse })
  async getVehicleSummary(@Req() req: FleetRequestContext): Promise<VehicleSummaryResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const [vehicles, limit] = await Promise.all([
      this.listVehiclesUseCase.execute({
        tenantId,
        ownerOperatorId: this.ownerOperatorIdFromRequest(req),
      }),
      this.vehicleQuotaReader.findActiveVehicleLimit(tenantId),
    ]);
    const counts = { total: 0, active: 0, inactive: 0, maintenance: 0, decommissioned: 0 };
    for (const v of vehicles as unknown as Array<{ status: string }>) {
      counts.total++;
      if (v.status === "active") counts.active++;
      else if (v.status === "inactive") counts.inactive++;
      else if (v.status === "maintenance") counts.maintenance++;
      else if (v.status === "decommissioned") counts.decommissioned++;
    }

    // The allowance counts active vehicles, matching what POST /vehicles
    // enforces. A null limit is unlimited, which is not the same as zero, so
    // the card renders a plain count rather than a bar in that case.
    const allowance = {
      limit,
      used: counts.active,
      remaining: limit === null ? null : Math.max(limit - counts.active, 0),
      usedPercent: limit === null || limit === 0 ? null : Math.round((counts.active / limit) * 100),
      unlimited: limit === null,
    };

    return {
      status: true,
      message: "success",
      data: { ...counts, allowance },
    } as unknown as VehicleSummaryResponse;
  }

  @Get("export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export vehicles as CSV", description: "Returns a CSV of all vehicles for the calling tenant." })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportVehicles(@Query() query: VehicleListQueryDto, @Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicles = await this.listVehiclesUseCase.execute({
      tenantId,
      ownerOperatorId: this.ownerOperatorIdFromRequest(req),
      query: query.query,
      status: query.status,
      type: query.type,
      yearFrom: query.yearFrom ? parseInt(query.yearFrom, 10) : undefined,
      yearTo: query.yearTo ? parseInt(query.yearTo, 10) : undefined,
    }) as unknown as Array<Record<string, unknown>>;
    // Same columns as the import template, so an export can be edited and
    // imported back without reshaping it by hand.
    const csv = buildVehicleCsvExport(
      vehicles.map((v) => ({
        registrationNumber: String(v["registrationNumber"] ?? v["plateNumber"] ?? ""),
        vin: (v["vin"] as string | null) ?? null,
        make: (v["make"] as string | null) ?? null,
        model: String(v["model"] ?? ""),
        year: (v["year"] as number | null) ?? null,
        type: (v["type"] as string | null) ?? null,
        fuelType: (v["fuelType"] as string | null) ?? null,
        capacity: (v["capacity"] as number | null) ?? null,
        capacityUnit: normalizeCapacityUnit(v["capacityUnit"]),
        status: (v["status"] as string | null) ?? null,
      })),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicles.csv");
    res.send(csv);
  }

  /** Retrieve standalone device inventory for the fleet admin Devices page */

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create vehicle",
    description: "Epic C (US-C01): create a new fleet vehicle.",
  })
  @ApiCreatedResponse({ type: VehicleResponse })
  async createVehicle(@Body() payload: CreateVehicleDto, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    let result;
    try {
      result = await this.runFleetUseCase(() =>
        this.createVehicleUseCase.execute({
          ...payload,
          tenantId: this.tenantIdFromRequest(req),
          ownerOperatorId: this.ownerOperatorIdFromRequest(req),
        }),
      );
    } catch (error) {
      if (error instanceof VehicleQuotaExceededError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
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

  @Get("import/template")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({
    summary: "Download the bulk import CSV template",
    description:
      "Returns the CSV layout the import expects, with one example row. Same columns as the vehicle export, so an export can be edited and imported back.",
  })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async downloadImportTemplate(@Res({ passthrough: false }) res: any): Promise<void> {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicle-import-template.csv");
    res.send(buildVehicleCsvTemplate());
  }

  @Get("import/columns")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({
    summary: "Describe the bulk import columns",
    description: "The column list behind the template, so the UI can explain the format without parsing the CSV.",
  })
  @ApiOkResponse({ description: "Column definitions" })
  async describeImportColumns() {
    return { status: true, message: "success", data: { columns: VEHICLE_CSV_COLUMNS } };
  }

  @Get("capacity-units")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "List load capacity units",
    description:
      "Fills the Unit dropdown on the Add Vehicle form. Mass units resolve to a common weight; volume and pallets do not, so they are reported separately.",
  })
  @ApiOkResponse({ description: "Capacity units" })
  async listCapacityUnits() {
    return {
      status: true,
      message: "success",
      data: {
        units: VEHICLE_CAPACITY_UNITS.map((unit) => ({
          value: unit,
          label: VEHICLE_CAPACITY_UNIT_LABELS[unit],
          measures: unit === "m3" ? "volume" : unit === "pallets" ? "count" : "weight",
        })),
        default: "tons",
      },
    };
  }

  @Post("import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Bulk import vehicles from CSV",
    description:
      "Upserts vehicles by registration number from an uploaded CSV. Rows that cannot be read are reported and skipped; the rest still import.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiCreatedResponse({ type: BulkVehicleImportResponse })
  @ApiBadRequestResponse({ description: "Missing file, or the CSV is not readable" })
  @UseInterceptors(FileInterceptor("file", uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  async bulkImportVehicles(
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() req: FleetRequestContext,
  ): Promise<BulkVehicleImportResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Missing CSV file");
    }

    let parsed: ReturnType<typeof parseVehicleCsv>;
    try {
      parsed = parseVehicleCsv(file.buffer.toString("utf8"));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "The CSV could not be read");
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException(
        parsed.errors.length > 0
          ? `No importable rows. First problem on line ${parsed.errors[0].line}: ${parsed.errors[0].message}`
          : "The CSV contained no vehicle rows",
      );
    }

    const tenantId = this.tenantIdFromRequest(req);
    const ownerOperatorId = this.ownerOperatorIdFromRequest(req);
    await this.assertImportTouchesOnlyOwnVehicles(parsed.rows, tenantId, ownerOperatorId);

    const result = await this.runFleetUseCase(() => this.bulkImportVehiclesUseCase.execute({
      ownerOperatorId,
      items: parsed.rows.map((row) => ({
        registrationNumber: row.registrationNumber,
        plateNumber: row.registrationNumber,
        vin: row.vin ?? undefined,
        make: row.make ?? undefined,
        model: row.model,
        year: row.year ?? undefined,
        type: (row.type ?? undefined) as "truck" | "van" | "trailer" | undefined,
        fuelType: (row.fuelType ?? undefined) as never,
        capacity: row.capacity ?? undefined,
        capacityUnit: row.capacityUnit,
        status: (row.status ?? undefined) as never,
      })),
      tenantId,
    }));
    (result as unknown as Record<string, unknown>)["skipped"] = parsed.errors;
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

  @Portals("tenant", "service")
  @Get(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Get vehicle by ID" })
  @ApiOkResponse({ type: VehicleResponse })
  async getVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertOwnsVehicle(this.listVehiclesUseCase, tenantId, id, req);
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async updateVehicle(
    @Param("id") id: string,
    @Body() payload: UpdateVehicleDto,
    @Req() req: FleetRequestContext,
  ): Promise<VehicleResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertOwnsVehicle(this.listVehiclesUseCase, tenantId, id, req);
    const result = await this.runFleetUseCase(() =>
      this.updateVehicleUseCase.execute({ id, ...payload, tenantId }),
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

  @Requires("tenant.dispatch.manage")
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

  @Requires("tenant.dispatch.manage")
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async deleteVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<VehicleResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertOwnsVehicle(this.listVehiclesUseCase, tenantId, id, req);
    const result = await this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id, tenantId),
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

  private buildHealth(vehicle: HealthVehicle, entry: VehiclePosition | undefined) {
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
