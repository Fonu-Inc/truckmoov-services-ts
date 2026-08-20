import {
  Res,
  Param,
  Inject,
  Get,
  BadRequestException,
  Req,
  Controller,
  UseGuards,
  Header,
} from "@nestjs/common";
import { ApiOperation, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  DeliveryMetricsUseCase,
  ExportUseCase,
  DashboardUseCase,
  ExportEntity,
} from "./contexts/fleet/reports";
import { DeliveryMetricsResponse, DashboardResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Reports")
@Controller("reports")
@TenantScoped()
@UseGuards(RolesGuard)
export class ReportsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(DashboardUseCase) private readonly dashboardUseCase: DashboardUseCase,
    @Inject(DeliveryMetricsUseCase) private readonly deliveryMetricsUseCase: DeliveryMetricsUseCase,
    @Inject(ExportUseCase) private readonly exportUseCase: ExportUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("dashboard")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Operational dashboard — I01" })
  @ApiOkResponse({ type: DashboardResponse })
  async getDashboard(@Req() req: FleetRequestContext): Promise<DashboardResponse> {
    const data = await this.dashboardUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as DashboardResponse;
  }

  @Get("delivery-metrics")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delivery metrics — I05" })
  @ApiOkResponse({ type: DeliveryMetricsResponse })
  async getDeliveryMetrics(@Req() req: FleetRequestContext): Promise<DeliveryMetricsResponse> {
    const data = await this.deliveryMetricsUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as DeliveryMetricsResponse;
  }

  @Get("export/:entity")
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
}
