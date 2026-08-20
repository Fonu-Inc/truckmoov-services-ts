import {
  Body,
  Param,
  Inject,
  Get,
  Req,
  Controller,
  UseGuards,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { GeofenceService } from "@shared/geofence";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { LocationUpdateDto, SetGeofenceDto } from "./dto/geofence.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { VehicleHealthService } from "./vehicle-health.service";

@ApiTags("Routes")
@Controller("routes")
@TenantScoped()
@UseGuards(RolesGuard)
export class RoutesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(GeofenceService) private readonly geofenceService: GeofenceService,
    @Inject(VehicleHealthService) private readonly vehicleHealthService: VehicleHealthService,
  ) {
    super(auditLog, bus);
  }

  @Post(":vehicleId/geofence")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Register a geofence",
    description: "Stores a bounding box for a vehicle so we can detect deviations.",
  })
  @ApiCreatedResponse({ description: "Geofence stored" })
  async setGeofence(
    @Param("vehicleId") vehicleId: string,
    @Body() payload: SetGeofenceDto,
    @Req() req: FleetRequestContext,
  ) {
    this.geofenceService.set(vehicleId, {
      northeast: { lat: payload.northeast.lat, lng: payload.northeast.lng },
      southwest: { lat: payload.southwest.lat, lng: payload.southwest.lng },
    });
    await this.recordActivity(req, {
      entityType: "geofence",
      entityId: vehicleId,
      action: "vehicle.geofence.updated",
      summary: "Vehicle geofence updated",
      metadata: {
        northeast: payload.northeast,
        southwest: payload.southwest,
      },
    });
    return { status: true, message: "geofence registered" };
  }

  @Get(":vehicleId/geofence")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Read the configured geofence" })
  @ApiOkResponse({ description: "Current bounding box" })
  async getGeofence(@Param("vehicleId") vehicleId: string) {
    return { status: true, geofence: this.geofenceService.get(vehicleId) };
  }

  @Post(":vehicleId/location")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Report live position and detect deviations" })
  @ApiOkResponse({ description: "Deviation flag" })
  async reportLocation(
    @Param("vehicleId") vehicleId: string,
    @Body() payload: LocationUpdateDto,
  ) {
    this.vehicleHealthService.touch(vehicleId);
    const inside = this.geofenceService.isInside(vehicleId, {
      lat: payload.lat,
      lng: payload.lng,
    });
    if (!inside) {
      this.logger.warn(`Deviation for vehicle ${vehicleId} at ${payload.lat},${payload.lng}`);
    }
    return {
      status: true,
      deviation: !inside,
      point: payload,
      message: inside ? "within geofence" : "vehicle deviated",
    };
  }
}
