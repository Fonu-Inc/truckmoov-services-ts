import {
  Inject,
  Get,
  Req,
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
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { ListGpsDevicesUseCase } from "./contexts/fleet/vehicles";
import { GpsDeviceListResponse } from "./dto/fleet.schema";
import { GpsDeviceListQueryDto } from "./dto/vehicle.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("GPS Devices")
@Portals("tenant")
@OnResource("tenant.devices")
@Controller("gps-devices")
@TenantScoped()
@UseGuards(RolesGuard)
export class GpsDevicesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListGpsDevicesUseCase) private readonly listGpsDevicesUseCase: ListGpsDevicesUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.FLEET_ADMIN,
    Role.OWNER_OPERATOR,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "List GPS devices",
    description: "Legacy alias for device inventory with vehicle mapping details preserved for older clients.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiOkResponse({ type: GpsDeviceListResponse })
  async listGpsDevices(@Query() query: GpsDeviceListQueryDto, @Req() req: FleetRequestContext): Promise<GpsDeviceListResponse> {
    return {
      status: true,
      message: "success",
      data: await this.listGpsDevicesUseCase.execute({
        query: query.query,
        vehicleStatus: query.vehicleStatus,
        tenantId: this.tenantIdFromRequest(req),
      }),
    } as GpsDeviceListResponse;
  }

  /** Register a new vehicle in the fleet */
}
