import {
  BadRequestException,
  Body,
  Res,
  Param,
  Inject,
  Get,
  Req,
  Controller,
  UseGuards,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
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
  StatementExportQueryDto,
  ComputeProfitabilityDto,
  StatementQueryDto,
  UpsertFinancialConfigDto,
  FinancialSummaryQueryDto,
  normalizeFinancialConfig,
  normalizeStatementOptions,
} from "./dto/financials.dto";
import {
  FinancialSummaryResponse,
  FinancialConfigListResponse,
  FinancialConfigResponse,
  VehicleProfitabilityListResponse,
  FinancialStatementResponse,
  FinancialConfigNullableResponse,
} from "./dto/fleet.schema";
import { FleetFinancialsUseCase } from "./fleet-financials.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource, Requires } from "@shared/access";

@ApiTags("Financials")
@Portals("tenant")
@OnResource("tenant.financials")
@Controller("financials")
@TenantScoped()
@UseGuards(RolesGuard)
export class FinancialsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(FleetFinancialsUseCase) private readonly fleetFinancialsUseCase: FleetFinancialsUseCase,
  ) {
    super(auditLog, bus);
  }

  // Computes a figure from existing records; changes nothing.
  @Requires("tenant.financials.read")
  @Post("profitability")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Compute per-vehicle profitability" })
  @ApiOkResponse({ description: "Profitability array", type: VehicleProfitabilityListResponse })
  async computeProfitability(@Body() body: ComputeProfitabilityDto, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.computeProfitability(this.tenantIdFromRequest(req), body.periodMonths ?? 1, {
      from: body.from,
      to: body.to,
      search: body.search,
      marginFrom: body.marginFrom,
      marginTo: body.marginTo,
      revenueFrom: body.revenueFrom,
      revenueTo: body.revenueTo,
      netProfitFrom: body.netProfitFrom,
      netProfitTo: body.netProfitTo,
      scoreFrom: body.scoreFrom,
      scoreTo: body.scoreTo,
    });
    return { status: true, message: "success", data };
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Fleet financial summary" })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ description: "Financial summary", type: FinancialSummaryResponse })
  async getFinancialSummary(@Query() query: FinancialSummaryQueryDto, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.summary(this.tenantIdFromRequest(req), { from: query.from, to: query.to });
    return { status: true, message: "success", data };
  }

  @Get("configs")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "List financial configs" })
  @ApiOkResponse({ description: "Financial configs array", type: FinancialConfigListResponse })
  async listFinancialConfigs(@Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.listConfigs(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("configs/:vehicleId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Get financial config for a vehicle" })
  @ApiOkResponse({ description: "Financial config", type: FinancialConfigNullableResponse })
  async getFinancialConfig(@Param("vehicleId") vehicleId: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetFinancialsUseCase.getConfig(this.tenantIdFromRequest(req), vehicleId);
    return { status: true, message: "success", data };
  }

  @Put("configs/:vehicleId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Upsert financial config for a vehicle" })
  @ApiOkResponse({ description: "Config upserted", type: FinancialConfigResponse })
  async upsertFinancialConfig(@Param("vehicleId") vehicleId: string, @Body() body: UpsertFinancialConfigDto, @Req() req: FleetRequestContext) {
    const fields = normalizeFinancialConfig(body);
    // An empty body would otherwise write a row of nulls that the UI then
    // reads back as a configured vehicle.
    if (Object.keys(fields).length === 0) {
      throw new BadRequestException("No cost fields supplied");
    }
    const data = await this.fleetFinancialsUseCase.upsertConfig(this.tenantIdFromRequest(req), vehicleId, fields);
    return { status: true, message: "success", data };
  }

  @Get("vehicle-pl/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Export vehicle P&L as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportVehiclePL(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.fleetFinancialsUseCase.exportVehiclePL(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicle-pl.csv");
    res.send(csv);
  }

  @Get("cost-breakdown/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Export cost breakdown as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportCostBreakdown(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.fleetFinancialsUseCase.exportCostBreakdown(this.tenantIdFromRequest(req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=cost-breakdown.csv");
    res.send(csv);
  }

  @Get("statement/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Export the financial statement as PDF, CSV, or Excel" })
  @ApiQuery({ name: "format", required: false, enum: ["pdf", "csv", "xlsx"] })
  @ApiQuery({ name: "periodMonths", required: false, type: Number })
  @ApiOkResponse({ description: "Statement file", content: { "application/pdf": {}, "text/csv": {}, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {} } })
  async exportFinancialStatement(@Query() query: StatementExportQueryDto, @Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const { body, contentType, filename } = await this.fleetFinancialsUseCase.exportStatement(
      this.tenantIdFromRequest(req),
      query.format ?? "pdf",
      query.periodMonths ?? 1,
      normalizeStatementOptions(query),
    );
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(body);
  }

  @Get("statement")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.FINANCE_VIEWER)
  @ApiOperation({ summary: "Financial statement with score + 5-category cost breakdown" })
  @ApiQuery({ name: "periodMonths", required: false, type: Number })
  @ApiOkResponse({ type: FinancialStatementResponse })
  async getFinancialStatement(@Query() query: StatementQueryDto, @Req() req: FleetRequestContext): Promise<FinancialStatementResponse> {
    const data = await this.fleetFinancialsUseCase.buildStatement(this.tenantIdFromRequest(req), query.periodMonths ?? 1);
    return { status: true, message: "success", data } as unknown as FinancialStatementResponse;
  }

  /* ── Fuel Management Aliases (Phase 7) ─────────────────────────────────── */
}
