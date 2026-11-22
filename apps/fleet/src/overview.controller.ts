import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { TenantScoped } from "./tenant-scoped.decorator";
import { OverviewUseCase } from "./contexts/fleet/reports/application/overview.use-case";
import { resolveOverviewScope } from "./contexts/fleet/reports/domain/overview-scope";
import { Portals, SignedIn } from "@shared/access";

@ApiTags("Overview")
@ApiBearerAuth()
@Portals("tenant")
@SignedIn()
@Controller("overview")
@TenantScoped()
@UseGuards(RolesGuard)
export class OverviewController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(OverviewUseCase) private readonly overviewUseCase: OverviewUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  // Deliberately narrower than the operational dashboard: this surface is for
  // an organisation looking at its own fleet, not for platform or ops staff.
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({
    summary: "Account overview",
    description:
      "Cards, live delivery map, five most recent jobs, vehicles, drivers and alerts, active vehicles with their driver and route, ten most recent activity entries, recent chats, and fleet utilization by region. Enterprise admins see the whole tenant; an owner operator sees only its own vehicles, drivers and jobs.",
  })
  @ApiOkResponse({ description: "Overview returned" })
  @ApiForbiddenResponse({ description: "Caller is not an enterprise admin or owner operator" })
  async getOverview(@Req() req: FleetRequestContext) {
    const scope = resolveOverviewScope(req.user);
    const data = await this.overviewUseCase.execute(scope);
    return { status: true, message: "success", data };
  }
}
