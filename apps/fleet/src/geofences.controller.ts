import {
  Body,
  Param,
  Inject,
  Get,
  Req,
  NotFoundException,
  Patch,
  Delete,
  Controller,
  UseGuards,
  Post,
  Put,
  Query,
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
import { GeofenceZoneListResponse, MessageResponse, GeofenceZoneResponse } from "./dto/fleet.schema";
import { SetGeofenceVehiclesDto, CreateGeofenceZoneDto, UpdateGeofenceZoneDto } from "./dto/geofence.dto";
import { GeofenceZonesUseCase, GeofenceZoneNotFoundError } from "./geofence-zones.use-case";
import { GeofenceEvaluatorService } from "./contexts/fleet/tracking/application/geofence-evaluator.service";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals } from "@shared/access";

@ApiTags("Geofences")
@Portals("tenant")
@Controller("geofences")
@TenantScoped()
@UseGuards(RolesGuard)
export class GeofencesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(GeofenceZonesUseCase) private readonly geofenceZonesUseCase: GeofenceZonesUseCase,
    @Inject(GeofenceEvaluatorService) private readonly geofenceEvaluator: GeofenceEvaluatorService,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List geofence zones" })
  @ApiQuery({ name: "status", required: false, enum: ["ACTIVE", "ARCHIVED"] })
  @ApiOkResponse({ description: "Geofence zones array", type: GeofenceZoneListResponse })
  async listGeofenceZones(@Query("status") status: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const [zones, occupants] = await Promise.all([
      this.geofenceZonesUseCase.list(tenantId, { status: (status as any) ?? "ACTIVE" }),
      this.geofenceEvaluator.occupantCounts(tenantId),
    ]);

    // The count chip means vehicles inside the zone right now, which is not
    // the same as the vehicles assigned to watch it.
    const data = (zones as unknown as Array<Record<string, unknown>>).map((zone) => ({
      ...zone,
      vehiclesInside: occupants.get(String(zone["id"])) ?? 0,
    }));
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create geofence zone" })
  @ApiCreatedResponse({ description: "Zone created", type: GeofenceZoneResponse })
  async createGeofenceZone(@Body() body: CreateGeofenceZoneDto, @Req() req: FleetRequestContext) {
    const data = await this.geofenceZonesUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Get(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get geofence zone" })
  @ApiOkResponse({ description: "Geofence zone", type: GeofenceZoneResponse })
  async getGeofenceZone(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const [zone, occupants] = await Promise.all([
        this.geofenceZonesUseCase.get(tenantId, id),
        this.geofenceEvaluator.occupants(tenantId, id),
      ]);

      const data = {
        ...(zone as unknown as Record<string, unknown>),
        vehiclesInside: occupants.length,
        occupants: occupants.map((occupant) => ({
          vehicleId: occupant.vehicleId,
          enteredAt: occupant.enteredAt.toISOString(),
        })),
      };
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update geofence zone" })
  @ApiOkResponse({ description: "Zone updated", type: GeofenceZoneResponse })
  async updateGeofenceZone(@Param("id") id: string, @Body() body: UpdateGeofenceZoneDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.geofenceZonesUseCase.update(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Archive geofence zone (soft delete)" })
  @ApiOkResponse({ description: "Zone archived", type: MessageResponse })
  async deleteGeofenceZone(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.geofenceZonesUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  @Put(":id/vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set vehicle assignments for a geofence zone" })
  @ApiOkResponse({ description: "Assignments updated", type: GeofenceZoneResponse })
  async setGeofenceVehicleAssignments(@Param("id") id: string, @Body() body: SetGeofenceVehiclesDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.geofenceZonesUseCase.setVehicleAssignments(this.tenantIdFromRequest(req), id, body.vehicleIds ?? []);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  /* ── Maintenance Records ───────────────────────────────────────────────── */
}
