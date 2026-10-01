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
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { RecommendDriversUseCase } from "./contexts/fleet/dispatch/application/recommend-drivers.use-case";
import { RecommendVehiclesUseCase } from "./contexts/fleet/dispatch/application/recommend-vehicles.use-case";
import { ListDriversUseCase } from "./contexts/fleet/drivers";
import { normalizeDriverStatus, DRIVER_STATUS_INPUTS } from "./contexts/fleet/drivers/domain/entities/driver.entity";
import { ListVehiclesUseCase } from "./contexts/fleet/vehicles";
import { DispatchSearchResponse, RecommendDriversResponse, RecommendVehiclesResponse } from "./dto/fleet.schema";
import { RecommendDriversQueryDto, RecommendVehiclesQueryDto, DispatchSearchQueryDto } from "./dto/vehicle.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("Dispatch")
@Portals("tenant")
@OnResource("tenant.dispatch")
@Controller("dispatch")
@TenantScoped()
@UseGuards(RolesGuard)
export class DispatchController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListVehiclesUseCase) private readonly listVehiclesUseCase: ListVehiclesUseCase,
    @Inject(ListDriversUseCase) private readonly listDriversUseCase: ListDriversUseCase,
    @Inject(RecommendDriversUseCase) private readonly recommendDriversUseCase: RecommendDriversUseCase,
    @Inject(RecommendVehiclesUseCase) private readonly recommendVehiclesUseCase: RecommendVehiclesUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("search")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Dispatch search",
    description: "Epic C (US-C06): combined search/filter over vehicles and drivers.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "driverStatus", required: false, enum: DRIVER_STATUS_INPUTS })
  @ApiQuery({ name: "assignedOnly", required: false, enum: ["true", "false"] })
  @ApiOkResponse({ type: DispatchSearchResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async searchDispatch(@Query() query: DispatchSearchQueryDto, @Req() req: FleetRequestContext): Promise<DispatchSearchResponse> {
    const assignedOnly = this.parseOptionalBoolean(query.assignedOnly, "assignedOnly");

    const [vehicles, drivers] = await Promise.all([
      this.listVehiclesUseCase.execute({
        query: query.query,
        status: query.vehicleStatus,
        assigned: assignedOnly,
        tenantId: this.tenantIdFromRequest(req),
      }),
      this.listDriversUseCase.execute({
        query: query.query,
        status: normalizeDriverStatus(query.driverStatus),
        assigned: assignedOnly,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ]);

    return { vehicles, drivers } as unknown as DispatchSearchResponse;
  }

  @Get("recommend-drivers")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Rank drivers for a job by availability, capacity, type, and proximity" })
  @ApiQuery({ name: "requiredCapacity", required: false, type: Number })
  @ApiQuery({ name: "vehicleType", required: false, enum: ["truck", "van", "trailer"] })
  @ApiQuery({ name: "pickupLat", required: false, type: Number })
  @ApiQuery({ name: "pickupLng", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: RecommendDriversResponse })
  async recommendDrivers(@Query() query: RecommendDriversQueryDto, @Req() req: FleetRequestContext): Promise<RecommendDriversResponse> {
    const data = await this.recommendDriversUseCase.execute(this.tenantIdFromRequest(req), query);
    return { status: true, message: "success", data } as unknown as RecommendDriversResponse;
  }

  @Get("recommend-vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Rank vehicles for a job by availability, capacity, type, fuel, and proximity",
    description: "Same shape and scoring approach as recommend-drivers. A vehicle on an active dispatch job (assigned through loaded) or in maintenance still appears, ranked low, with the reason.",
  })
  @ApiOkResponse({ type: RecommendVehiclesResponse })
  async recommendVehicles(@Query() query: RecommendVehiclesQueryDto, @Req() req: FleetRequestContext): Promise<RecommendVehiclesResponse> {
    const data = await this.recommendVehiclesUseCase.execute(this.tenantIdFromRequest(req), query);
    return { status: true, message: "success", data };
  }
}
