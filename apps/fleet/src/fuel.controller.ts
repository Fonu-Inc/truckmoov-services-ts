import {
  Body,
  Res,
  Param,
  Inject,
  Get,
  BadRequestException,
  Req,
  NotFoundException,
  Patch,
  Controller,
  Delete,
  UseGuards,
  Post,
  Put,
  Query,
  Header,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import {
  applyFuelFilters,
  buildWeeklyFuelSeries,
  type FuelRecordView,
} from "./contexts/fleet/fuel/domain/fuel-analytics";
import { ListVehiclesUseCase } from "./contexts/fleet/vehicles";
import { ListDriversUseCase } from "./contexts/fleet/drivers";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  FuelBudgetUseCase,
  FuelMetricsUseCase,
  FuelRecordNotFoundError,
  FuelThresholdService,
  ListFuelRecordsUseCase,
  DeleteFuelRecordUseCase,
  UpdateFuelRecordUseCase,
  RecordFuelUseCase,
  FUEL_RECORD_FIELDS,
  type FuelRecordProps,
} from "./contexts/fleet/fuel";
import {
  FuelThresholdResponse,
  FuelBudgetVsActualResponse,
  FuelBudgetListResponse,
  FuelSummaryResponse,
  FuelBudgetResponse,
  VehicleEfficiencySchema,
  FuelEfficiencyResponse,
  FuelRecordResponse,
  FuelConsumptionResponse,
  FuelThresholdListResponse,
  FuelRecordListResponse,
  ConsumptionBucketSchema,
  MessageResponse,
} from "./dto/fleet.schema";
import {
  RecordFuelDto,
  UpsertFuelBudgetDto,
  FuelMetricsQueryDto,
  FuelListQueryDto,
  BudgetVsActualQueryDto,
  UpdateFuelRecordDto,
  FuelThresholdDto,
} from "./dto/fuel.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";
import { toCsv } from "./utils/csv";

type FuelListRow = FuelRecordView & FuelRecordProps;

@ApiTags("Fuel")
@Portals("tenant")
@OnResource("tenant.fuel")
@Controller("fuel")
@TenantScoped()
@UseGuards(RolesGuard)
export class FuelController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(RecordFuelUseCase) private readonly recordFuelUseCase: RecordFuelUseCase,
    @Inject(ListFuelRecordsUseCase) private readonly listFuelRecordsUseCase: ListFuelRecordsUseCase,
    @Inject(UpdateFuelRecordUseCase) private readonly updateFuelRecordUseCase: UpdateFuelRecordUseCase,
    @Inject(DeleteFuelRecordUseCase) private readonly deleteFuelRecordUseCase: DeleteFuelRecordUseCase,
    @Inject(FuelMetricsUseCase) private readonly fuelMetricsUseCase: FuelMetricsUseCase,
    @Inject(FuelBudgetUseCase) private readonly fuelBudgetUseCase: FuelBudgetUseCase,
    @Inject(FuelThresholdService) private readonly fuelThresholdService: FuelThresholdService,
    @Inject(ListVehiclesUseCase) private readonly listVehiclesUseCase: ListVehiclesUseCase,
    @Inject(ListDriversUseCase) private readonly listDriversUseCase: ListDriversUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("transactions")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({
    summary: "List fuel transactions (alias for /fuel/records)",
    description:
      "Supports the search box and the filter panel: free text across registration, driver and station, plus fuel type, litre range, total range and date range.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "fuelType", required: false, enum: ["diesel", "petrol", "ev", "hybrid"] })
  @ApiQuery({ name: "litresFrom", required: false, type: Number })
  @ApiQuery({ name: "litresTo", required: false, type: Number })
  @ApiQuery({ name: "totalFrom", required: false, type: Number })
  @ApiQuery({ name: "totalTo", required: false, type: Number })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelRecordListResponse })
  async listFuelTransactions(
    @Query() query: FuelListQueryDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordListResponse> {
    const data = await this.filteredFuelRecords(this.tenantIdFromRequest(req), query, req);
    return { status: true, message: "success", data } as unknown as FuelRecordListResponse;
  }

  private async filteredFuelRecords(tenantId: string, query: FuelListQueryDto, req: FleetRequestContext) {
    const records = await this.listFuelRecordsUseCase.execute({
      tenantId,
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      station: query.station,
      from: query.from,
      to: query.to,
    });
    const visible = await this.onlyOwnersVehicles(records as unknown as FuelListRow[], tenantId, req);
    return applyFuelFilters(visible, query);
  }

  /**
   * An owner operator sees fuel for their own vehicles and no others; every
   * other role sees the whole account, as before.
   */
  private async onlyOwnersVehicles<T extends { vehicleId: string }>(
    rows: T[],
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<T[]> {
    const owned = await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req);
    return owned ? rows.filter((row) => owned.has(row.vehicleId)) : rows;
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fuel summary stats" })
  @ApiOkResponse({ description: "Fuel summary", type: FuelSummaryResponse })
  async getFuelSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const primitives = await this.onlyOwnersVehicles(await this.listFuelRecordsUseCase.execute({ tenantId }), tenantId, req);
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

  @Get("budgets")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "List fuel budgets (fleet-wide + per-vehicle) — N09" })
  @ApiOkResponse({ type: FuelBudgetListResponse })
  async listFuelBudgets(@Req() req: FleetRequestContext): Promise<FuelBudgetListResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.fuelBudgetUseCase.list(
      tenantId,
      await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Get("budget-vs-actual")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fuel budget vs actual spend — N09" })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelBudgetVsActualResponse })
  async fuelBudgetVsActual(@Query() query: BudgetVsActualQueryDto, @Req() req: FleetRequestContext): Promise<FuelBudgetVsActualResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.fuelBudgetUseCase.budgetVsActual(
      tenantId,
      query,
      await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req),
    );
    return { status: true, message: "success", data } as unknown as FuelBudgetVsActualResponse;
  }

  @Put("budgets/:vehicleId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Upsert a fuel budget — use 'all' for fleet-wide — N09" })
  @ApiOkResponse({ type: FuelBudgetResponse })
  async upsertFuelBudget(
    @Param("vehicleId") vehicleId: string,
    @Body() body: UpsertFuelBudgetDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelBudgetResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    // "all" is the fleet-wide budget, which is not one vehicle's, so an owner
    // operator is refused it as they would be any vehicle they do not own.
    await this.assertOwnsVehicle(this.listVehiclesUseCase, tenantId, vehicleId, req);
    const data = await this.fuelBudgetUseCase.upsert(tenantId, vehicleId, body);
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Record fuel transaction — N01" })
  @ApiCreatedResponse({ type: FuelRecordResponse })
  async recordFuel(
    @Body() dto: RecordFuelDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    // The modal collects a registration and a typed driver name, not ids.
    const { vehicleId, driverId } = await this.resolveFuelSubjects(
      tenantId,
      dto,
      this.ownerOperatorIdFromRequest(req),
    );
    await this.assertOwnsVehicle(this.listVehiclesUseCase, tenantId, vehicleId, req);
    const data = await this.recordFuelUseCase.execute({
      ...dto,
      vehicleId,
      driverId,
      tenantId,
      recordedBy: req.user?.userId ?? "system",
    });
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
    return { status: true, message: "success", data };
  }

  /**
   * Resolves the registration and driver name a person typed into ids. An
   * unknown registration is refused rather than guessed: a fuel record filed
   * against the wrong truck is worse than one not filed at all.
   */
  private async resolveFuelSubjects(
    tenantId: string,
    dto: RecordFuelDto,
    ownerOperatorId?: string,
  ): Promise<{ vehicleId: string; driverId: string | null }> {
    const { vehicleId, driverId } = await this.resolveFuelUpdateSubjects(tenantId, dto, ownerOperatorId);
    if (!vehicleId) {
      throw new BadRequestException("Provide either vehicleId or vehicleRegistration");
    }
    return { vehicleId, driverId: driverId ?? null };
  }

  /** Only the subjects the caller named come back; an absent key means leave it unchanged. */
  private async resolveFuelUpdateSubjects(
    tenantId: string,
    dto: UpdateFuelRecordDto,
    ownerOperatorId?: string,
  ): Promise<{ vehicleId?: string; driverId?: string | null }> {
    const subjects: { vehicleId?: string; driverId?: string | null } = {};

    const vehicleId = dto.vehicleId?.trim();
    const registration = dto.vehicleRegistration?.trim();
    if (vehicleId) {
      subjects.vehicleId = vehicleId;
    } else if (registration) {
      subjects.vehicleId = await this.findVehicleIdByRegistration(tenantId, registration, ownerOperatorId);
    }

    const driverId = dto.driverId?.trim();
    const driverName = dto.driverName?.trim();
    if (driverId) {
      subjects.driverId = driverId;
    } else if (driverName) {
      subjects.driverId = await this.findDriverIdByName(tenantId, driverName);
    } else if (dto.driverId === null) {
      subjects.driverId = null;
    }

    return subjects;
  }

  private async findVehicleIdByRegistration(
    tenantId: string,
    registration: string,
    ownerOperatorId?: string,
  ): Promise<string> {
    // An owner operator can only name their own vehicles, so a stranger's
    // registration reads as unknown rather than confirming it exists.
    const vehicles = await this.listVehiclesUseCase.execute({ tenantId, query: registration, ownerOperatorId });
    const match = (vehicles as unknown as Array<Record<string, unknown>>).find(
      (vehicle) =>
        String(vehicle["registrationNumber"] ?? vehicle["plateNumber"] ?? "").toLowerCase() ===
        registration.toLowerCase(),
    );
    if (!match) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        message: `No vehicle is registered as ${registration}`,
        field: "vehicleRegistration",
      });
    }
    return String(match["id"]);
  }

  // A name that matches nobody is kept off the record rather than failing the
  // purchase: the fuel was still bought.
  private async findDriverIdByName(tenantId: string, driverName: string): Promise<string | null> {
    const drivers = await this.listDriversUseCase.execute({ tenantId });
    const match = (drivers as unknown as Array<Record<string, unknown>>).find(
      (driver) => String(driver["name"] ?? "").toLowerCase() === driverName.toLowerCase(),
    );
    return match ? String(match["id"]) : null;
  }

  @Get("analytics/weekly")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({
    summary: "Weekly fuel consumption by fuel type",
    description:
      "Litres per weekday split by fuel type, for the Analytics sub-tab. Always returns all seven days so the chart keeps its shape on a quiet week.",
  })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ description: "Weekly consumption series" })
  async weeklyFuelConsumption(
    @Query("from") from: string,
    @Query("to") to: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const records = await this.listFuelRecordsUseCase.execute({ tenantId, from, to });
    const visible = await this.onlyOwnersVehicles(
      records as unknown as Array<FuelRecordView & { vehicleId: string }>,
      tenantId,
      req,
    );
    return {
      status: true,
      message: "success",
      data: buildWeeklyFuelSeries(visible),
    };
  }

  @Get("metrics")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fuel consumption chart — N04" })
  @ApiQuery({ name: "period", required: false, enum: ["daily", "weekly", "monthly"] })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelConsumptionResponse })
  async fuelConsumption(@Query() query: FuelMetricsQueryDto, @Req() req: FleetRequestContext): Promise<FuelConsumptionResponse> {
    const buckets = await this.fuelMetricsUseCase.consumption(this.tenantIdFromRequest(req), query.period ?? "monthly", {
      from: query.from,
      to: query.to,
    });
    return { status: true, message: "success", data: buckets as ConsumptionBucketSchema[] };
  }

  @Get("efficiency")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Vehicle fuel efficiency — N05" })
  @ApiOkResponse({ type: FuelEfficiencyResponse })
  async fuelEfficiency(@Req() req: FleetRequestContext): Promise<FuelEfficiencyResponse> {
    const result = await this.fuelMetricsUseCase.efficiency(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: result as VehicleEfficiencySchema[] };
  }

  @Get("thresholds")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get fuel efficiency thresholds — N08" })
  @ApiOkResponse({ type: FuelThresholdListResponse })
  async listFuelThresholds(@Req() req: FleetRequestContext): Promise<FuelThresholdListResponse> {
    return { status: true, message: "success", data: await this.fuelThresholdService.getAll(this.tenantIdFromRequest(req)) };
  }

  @Get("export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @Header("Content-Type", "text/csv")
  @ApiOperation({
    summary: "Export fuel transactions to CSV — N07",
    description: "Takes the same filters as /fuel/transactions and exports exactly the rows that list shows.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "fuelType", required: false, enum: ["diesel", "petrol", "ev", "hybrid"] })
  @ApiQuery({ name: "litresFrom", required: false, type: Number })
  @ApiQuery({ name: "litresTo", required: false, type: Number })
  @ApiQuery({ name: "totalFrom", required: false, type: Number })
  @ApiQuery({ name: "totalTo", required: false, type: Number })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ description: "CSV file", schema: { type: "string", format: "binary" } })
  async exportFuel(
    @Query() query: FuelListQueryDto,
    @Req() req: FleetRequestContext,
    @Res() res: any,
  ): Promise<void> {
    const records = await this.filteredFuelRecords(this.tenantIdFromRequest(req), query, req);
    const csv = toCsv(
      records.map((record) => ({ ...record, auditTrail: JSON.stringify(record.auditTrail) })),
      FUEL_RECORD_FIELDS,
    );
    res.setHeader("Content-Disposition", `attachment; filename="fuel.csv"`);
    res.send(csv);
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List fuel transactions — N02" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "driverId", required: false, type: String })
  @ApiQuery({ name: "station", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelRecordListResponse })
  async listFuel(@Query() query: FuelListQueryDto, @Req() req: FleetRequestContext): Promise<FuelRecordListResponse> {
    const records = await this.listFuelRecordsUseCase.execute({ ...query, tenantId: this.tenantIdFromRequest(req) });
    return { status: true, message: "success", data: records };
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Edit fuel transaction with audit trail — N03" })
  @ApiOkResponse({ type: FuelRecordResponse })
  async updateFuel(
    @Param("id") id: string,
    @Body() dto: UpdateFuelRecordDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const subjects = await this.resolveFuelUpdateSubjects(tenantId, dto, this.ownerOperatorIdFromRequest(req));
      const allowedVehicleIds = await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req);
      const data = await this.runFleetUseCase(() =>
        this.updateFuelRecordUseCase.execute({
          id,
          tenantId,
          updatedBy: req.user?.userId ?? "system",
          ...dto,
          ...subjects,
          allowedVehicleIds,
        }),
      );
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
      return { status: true, message: "success", data };
    } catch (err) {
      if (err instanceof FuelRecordNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Delete fuel transaction with audit trail — N03" })
  @ApiOkResponse({ description: "Deleted successfully", type: MessageResponse })
  async deleteFuel(
    @Param("id") id: string,
    @Req() req: FleetRequestContext,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const allowedVehicleIds = await this.ownedVehicleIdsVia(this.listVehiclesUseCase, tenantId, req);
      await this.deleteFuelRecordUseCase.execute(id, tenantId, req.user?.userId ?? "system", allowedVehicleIds);
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

  @Put("thresholds/:vehicleType")
  @Roles(Role.ENTERPRISE_ADMIN)
  @ApiOperation({ summary: "Set fuel efficiency threshold by vehicle type — N08" })
  @ApiOkResponse({ type: FuelThresholdResponse })
  async setFuelThreshold(
    @Param("vehicleType") vehicleType: string,
    @Body() dto: FuelThresholdDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelThresholdResponse> {
    try {
      const threshold = await this.fuelThresholdService.set(this.tenantIdFromRequest(req), vehicleType, dto.minKmPerLiter);
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
}
