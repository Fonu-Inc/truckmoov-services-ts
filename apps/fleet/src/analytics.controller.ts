import {
  Inject,
  Get,
  Header,
  Req,
  Res,
  Controller,
  UseGuards,
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
import { buildAnalyticsCsv } from "./contexts/fleet/reports/domain/analytics-csv";
import { ANALYTICS_PERIOD_DAYS, parseAnalyticsPeriodDays } from "./contexts/fleet/reports/domain/analytics-period";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  AnalyticsSummaryResponse,
  VehicleSafetyRadarResponse,
  FleetStatusResponse,
  DriverScoreListResponse,
  JobPipelineResponse,
  AnalyticsEventListResponse,
  FuelLevelsResponse,
} from "./dto/fleet.schema";
import { FleetAnalyticsUseCase } from "./fleet-analytics.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals } from "@shared/access";

@ApiTags("Analytics")
@Portals("tenant")
@Controller("analytics")
@TenantScoped()
@UseGuards(RolesGuard)
export class AnalyticsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(FleetAnalyticsUseCase) private readonly fleetAnalyticsUseCase: FleetAnalyticsUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Analytics summary", description: "High-level fleet summary across vehicles, drivers, jobs, and safety events for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "Analytics summary object", type: AnalyticsSummaryResponse })
  async getAnalyticsSummary(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.summary(this.tenantIdFromRequest(req), parseAnalyticsPeriodDays(periodDays));
    return { status: true, message: "success", data };
  }

  @Get("fleet-status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fleet status breakdown", description: "Vehicles grouped by status for the calling tenant." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "Fleet status breakdown", type: FleetStatusResponse })
  async getFleetStatus(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.fleetStatus(this.tenantIdFromRequest(req), parseAnalyticsPeriodDays(periodDays));
    return { status: true, message: "success", data };
  }

  @Get("job-pipeline")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Job pipeline", description: "Jobs grouped by status for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "Job pipeline breakdown", type: JobPipelineResponse })
  async getJobPipeline(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.jobPipeline(this.tenantIdFromRequest(req), parseAnalyticsPeriodDays(periodDays));
    return { status: true, message: "success", data };
  }

  @Get("fuel-levels")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fuel levels", description: "Per-vehicle fuel level (from telemetry where available)." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "Fuel level array per vehicle", type: FuelLevelsResponse })
  async getFuelLevels(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.fuelLevels(this.tenantIdFromRequest(req), parseAnalyticsPeriodDays(periodDays));
    return { status: true, message: "success", data };
  }

  @Get("driver-scores")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Driver safety scores", description: "Safety scores per driver based on behavior events in the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Driver scores array", type: DriverScoreListResponse })
  async getDriverScores(@Query("period_days") periodDays: string, @Query("limit") limit: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.driverScores(
      this.tenantIdFromRequest(req),
      parseAnalyticsPeriodDays(periodDays),
      parseInt(limit ?? "20", 10),
    );
    return { status: true, message: "success", data };
  }

  @Get("events")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Behavior events", description: "Alert/behavior event list with filters for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "severity", required: false, enum: ["low", "medium", "high", "critical"] })
  @ApiOkResponse({ description: "Events array", type: AnalyticsEventListResponse })
  async getAnalyticsEvents(
    @Query("period_days") periodDays: string,
    @Query("limit") limit: string,
    @Query("severity") severity: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.fleetAnalyticsUseCase.events(
      this.tenantIdFromRequest(req),
      parseAnalyticsPeriodDays(periodDays),
      parseInt(limit ?? "50", 10),
      severity,
    );
    return { status: true, message: "success", data };
  }

  @Get("vehicle-safety-radar")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fleet safety radar", description: "Average driver behavior scores across the fleet: braking, acceleration, speed control, and cornering for the given period." })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "Average behavior scores per dimension (0-100)", type: VehicleSafetyRadarResponse })
  async getVehicleSafetyRadar(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const data = await this.fleetAnalyticsUseCase.vehicleSafetyRadar(this.tenantIdFromRequest(req), parseAnalyticsPeriodDays(periodDays));
    return { status: true, message: "success", data };
  }

  @Get("export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @Header("Content-Type", "text/csv")
  @ApiOperation({
    summary: "Export the analytics tab as CSV",
    description:
      "One file covering the summary, fleet status, job pipeline, fuel levels and driver scores for the period, so the tab exports like every other tab.",
  })
  @ApiQuery({ name: "period_days", required: false, enum: [...ANALYTICS_PERIOD_DAYS], type: Number })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportAnalytics(
    @Query("period_days") periodDays: string,
    @Req() req: FleetRequestContext,
    @Res({ passthrough: false }) res: any,
  ): Promise<void> {
    const tenantId = this.tenantIdFromRequest(req);
    const days = parseAnalyticsPeriodDays(periodDays);
    const [summary, fleetStatus, jobPipeline, fuelLevels, driverScores] = await Promise.all([
      this.fleetAnalyticsUseCase.summary(tenantId, days),
      this.fleetAnalyticsUseCase.fleetStatus(tenantId, days),
      this.fleetAnalyticsUseCase.jobPipeline(tenantId, days),
      this.fleetAnalyticsUseCase.fuelLevels(tenantId, days),
      this.fleetAnalyticsUseCase.driverScores(tenantId, days, 100),
    ]);

    res.setHeader("Content-Disposition", `attachment; filename=analytics-${days}d.csv`);
    res.send(
      buildAnalyticsCsv({
        periodDays: days,
        summary: summary as Record<string, unknown>,
        fleetStatus: fleetStatus as unknown,
        jobPipeline: jobPipeline as unknown,
        fuelLevels: fuelLevels as unknown,
        driverScores: driverScores as unknown,
      }),
    );
  }

  /* ── Maintenance Profiles ──────────────────────────────────────────────── */
}
