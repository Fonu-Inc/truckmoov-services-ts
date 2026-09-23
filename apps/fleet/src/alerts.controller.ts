import {
  Param,
  Inject,
  Get,
  Req,
  NotFoundException,
  Controller,
  UseGuards,
  Post,
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
  ListAlertsUseCase,
  AcknowledgeAlertUseCase,
  ResolveAlertUseCase,
  AlertNotFoundError,
  GetAlertStatsUseCase,
} from "./contexts/fleet/alerts";
import { Alert as FleetAlert, AlertStatus } from "./contexts/fleet/alerts/domain/alert.entity";
import { AlertStatsResponse, AlertResponse, AlertListResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals } from "@shared/access";

@ApiTags("Alerts")
@Portals("tenant")
@Controller("alerts")
@TenantScoped()
@UseGuards(RolesGuard)
export class AlertsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListAlertsUseCase) private readonly listAlertsUseCase: ListAlertsUseCase,
    @Inject(AcknowledgeAlertUseCase) private readonly acknowledgeAlertUseCase: AcknowledgeAlertUseCase,
    @Inject(ResolveAlertUseCase) private readonly resolveAlertUseCase: ResolveAlertUseCase,
    @Inject(GetAlertStatsUseCase) private readonly getAlertStatsUseCase: GetAlertStatsUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("stats")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Alert statistics — H06" })
  @ApiOkResponse({ type: AlertStatsResponse })
  async getAlertStats(@Req() req: FleetRequestContext): Promise<AlertStatsResponse> {
    const data = await this.getAlertStatsUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data } as unknown as AlertStatsResponse;
  }

  @Get()
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

  @Post(":id/acknowledge")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Acknowledge alert — H04" })
  @ApiQuery({ name: "by", required: false, type: String, description: "Actor id recording the acknowledgement; defaults to the authenticated user." })
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

  @Post(":id/resolve")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: "Resolve alert — H04" })
  @ApiQuery({ name: "by", required: false, type: String, description: "Actor id recording the resolution; defaults to the authenticated user." })
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
}
