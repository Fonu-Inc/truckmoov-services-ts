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
} from "./contexts/fleet/fuel";
import { ExportUseCase } from "./contexts/fleet/reports";
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

@ApiTags("Fuel")
@Controller("fuel")
@TenantScoped()
@UseGuards(RolesGuard)
export class FuelController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ExportUseCase) private readonly exportUseCase: ExportUseCase,
    @Inject(RecordFuelUseCase) private readonly recordFuelUseCase: RecordFuelUseCase,
    @Inject(ListFuelRecordsUseCase) private readonly listFuelRecordsUseCase: ListFuelRecordsUseCase,
    @Inject(UpdateFuelRecordUseCase) private readonly updateFuelRecordUseCase: UpdateFuelRecordUseCase,
    @Inject(DeleteFuelRecordUseCase) private readonly deleteFuelRecordUseCase: DeleteFuelRecordUseCase,
    @Inject(FuelMetricsUseCase) private readonly fuelMetricsUseCase: FuelMetricsUseCase,
    @Inject(FuelBudgetUseCase) private readonly fuelBudgetUseCase: FuelBudgetUseCase,
    @Inject(FuelThresholdService) private readonly fuelThresholdService: FuelThresholdService,
  ) {
    super(auditLog, bus);
  }

  @Get("transactions")
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
    return { status: true, message: "success", data: records } as unknown as FuelRecordListResponse;
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fuel summary stats" })
  @ApiOkResponse({ description: "Fuel summary", type: FuelSummaryResponse })
  async getFuelSummary(@Req() req: FleetRequestContext) {
    const primitives = await this.listFuelRecordsUseCase.execute({ tenantId: this.tenantIdFromRequest(req) });
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
    const data = await this.fuelBudgetUseCase.list(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("budget-vs-actual")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fuel budget vs actual spend — N09" })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ type: FuelBudgetVsActualResponse })
  async fuelBudgetVsActual(@Query() query: BudgetVsActualQueryDto, @Req() req: FleetRequestContext): Promise<FuelBudgetVsActualResponse> {
    const data = await this.fuelBudgetUseCase.budgetVsActual(this.tenantIdFromRequest(req), query);
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
    const data = await this.fuelBudgetUseCase.upsert(this.tenantIdFromRequest(req), vehicleId, body);
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Record fuel transaction — N01" })
  @ApiCreatedResponse({ type: FuelRecordResponse })
  async recordFuel(
    @Body() dto: RecordFuelDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    const data = await this.recordFuelUseCase.execute({
      ...dto,
      tenantId: this.tenantIdFromRequest(req),
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

  @Get("metrics")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Vehicle fuel efficiency — N05" })
  @ApiOkResponse({ type: FuelEfficiencyResponse })
  async fuelEfficiency(@Req() req: FleetRequestContext): Promise<FuelEfficiencyResponse> {
    const result = await this.fuelMetricsUseCase.efficiency(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: result as VehicleEfficiencySchema[] };
  }

  @Get("thresholds")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get fuel efficiency thresholds — N08" })
  @ApiOkResponse({ type: FuelThresholdListResponse })
  listFuelThresholds(): FuelThresholdListResponse {
    return { status: true, message: "success", data: this.fuelThresholdService.getAll() };
  }

  @Get("export")
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

  @Get()
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
    return { status: true, message: "success", data: records };
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({ summary: "Edit fuel transaction with audit trail — N03" })
  @ApiOkResponse({ type: FuelRecordResponse })
  async updateFuel(
    @Param("id") id: string,
    @Body() dto: UpdateFuelRecordDto,
    @Req() req: FleetRequestContext,
  ): Promise<FuelRecordResponse> {
    try {
      const data = await this.updateFuelRecordUseCase.execute({
        id,
        tenantId: this.tenantIdFromRequest(req),
        updatedBy: req.user?.userId ?? "system",
        ...dto,
      });
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({ summary: "Delete fuel transaction with audit trail — N03" })
  @ApiOkResponse({ description: "Deleted successfully", type: MessageResponse })
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
}
