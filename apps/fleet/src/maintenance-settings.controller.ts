import { Body, Controller, Get, Inject, NotFoundException, Param, Put, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { OnResource, Portals } from "@shared/access";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { DispatchEligibilityResponse, MaintenanceSettingsResponse } from "./dto/fleet.schema";
import { UpdateMaintenanceSettingsDto } from "./dto/maintenance-settings.dto";
import { MAINTENANCE_PROFILE_REPOSITORY, type MaintenanceProfileRepository } from "./maintenance-profile.repository";
import {
  DEFAULT_MAINTENANCE_SETTINGS,
  MAINTENANCE_SETTINGS_REPOSITORY,
  dispatchEligibility,
  type MaintenanceSettings,
  type MaintenanceSettingsRepository,
} from "./maintenance-settings.repository";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Maintenance")
@Portals("tenant")
@OnResource("tenant.maintenance")
@Controller()
@TenantScoped()
@UseGuards(RolesGuard)
export class MaintenanceSettingsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(MAINTENANCE_SETTINGS_REPOSITORY) private readonly settings: MaintenanceSettingsRepository,
    @Inject(MAINTENANCE_PROFILE_REPOSITORY) private readonly profiles: MaintenanceProfileRepository,
  ) {
    super(auditLog, bus);
  }

  private async current(tenantId: string): Promise<MaintenanceSettings> {
    return (await this.settings.find(tenantId)) ?? DEFAULT_MAINTENANCE_SETTINGS;
  }

  @Get("settings/maintenance")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get maintenance dispatch settings", description: "Defaults are returned when the tenant has saved none." })
  @ApiOkResponse({ type: MaintenanceSettingsResponse })
  async getMaintenanceSettings(@Req() req: FleetRequestContext): Promise<MaintenanceSettingsResponse> {
    return { status: true, message: "success", data: await this.current(this.tenantIdFromRequest(req)) };
  }

  @Put("settings/maintenance")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Save maintenance dispatch settings" })
  @ApiOkResponse({ type: MaintenanceSettingsResponse })
  async saveMaintenanceSettings(
    @Body() body: UpdateMaintenanceSettingsDto,
    @Req() req: FleetRequestContext,
  ): Promise<MaintenanceSettingsResponse> {
    // Account-wide, so a limited owner operator inside someone else's organisation may not change it.
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Maintenance settings not found");
    const tenantId = this.tenantIdFromRequest(req);
    const settings: MaintenanceSettings = {
      dispatchOverdueAction: body.dispatchOverdueAction,
      dispatchDueAction: body.dispatchDueAction,
      warnDaysBefore: body.warnDaysBefore,
    };
    await this.settings.save(tenantId, settings, req.user?.userId ?? "system");
    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: tenantId,
      action: "maintenance.settings_saved",
      summary: `Maintenance dispatch rules set: overdue ${settings.dispatchOverdueAction}, due ${settings.dispatchDueAction}, warn ${settings.warnDaysBefore} days ahead`,
      metadata: { ...settings },
    });
    return { status: true, message: "Settings saved", data: settings };
  }

  /** Asked by dispatch before a vehicle is put on a job. */
  @Portals("service")
  @Get("maintenance/dispatch-eligibility/:vehicleId")
  @Roles(Role.DISPATCHER)
  @ApiExcludeEndpoint()
  @ApiOkResponse({ type: DispatchEligibilityResponse })
  async dispatchEligibility(
    @Param("vehicleId") vehicleId: string,
    @Req() req: FleetRequestContext,
  ): Promise<DispatchEligibilityResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    const [settings, profiles] = await Promise.all([
      this.current(tenantId),
      this.profiles.findAllByTenant(tenantId, { vehicleId }),
    ]);
    return { status: true, message: "success", data: dispatchEligibility(settings, profiles) };
  }
}
