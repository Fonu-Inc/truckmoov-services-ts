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
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { onlyAllowedVehicles, type AllowedVehicleIds } from "./allowed-vehicles";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("Geofences")
@Portals("tenant")
@OnResource("tenant.geofences")
@Controller("geofences")
@TenantScoped()
@UseGuards(RolesGuard)
export class GeofencesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(GeofenceZonesUseCase) private readonly geofenceZonesUseCase: GeofenceZonesUseCase,
    @Inject(GeofenceEvaluatorService) private readonly geofenceEvaluator: GeofenceEvaluatorService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
  ) {
    super(auditLog, bus);
  }

  private ownedVehicleIds(tenantId: string, req: FleetRequestContext) {
    return this.ownedVehicleIdsFor(this.vehicleRepository, tenantId, req);
  }

  /** Zones are shared by the whole account, so a limited owner operator cannot create, edit or archive one. */
  private assertMayManageZones(req: FleetRequestContext): void {
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Geofence zone not found");
  }

  private async vehiclesInside(tenantId: string, zoneIds: string[], owned: AllowedVehicleIds): Promise<Map<string, number>> {
    if (!owned) return this.geofenceEvaluator.occupantCounts(tenantId);
    const counts = await Promise.all(
      zoneIds.map(async (zoneId) => {
        const occupants = await this.geofenceEvaluator.occupants(tenantId, zoneId);
        return [zoneId, onlyAllowedVehicles(occupants, owned).length] as const;
      }),
    );
    return new Map(counts);
  }

  /** Replacing assignments must not drop the vehicles a limited owner operator cannot see. */
  private async assignmentsKeepingOthers(
    tenantId: string,
    zoneId: string,
    requested: string[],
    owned: AllowedVehicleIds,
  ): Promise<string[]> {
    if (!owned) return requested;
    const zone = await this.geofenceZonesUseCase.get(tenantId, zoneId);
    const others = zone.assignedVehicleIds.filter((vehicleId) => !owned.has(vehicleId));
    return [...new Set([...others, ...requested])];
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List geofence zones" })
  @ApiQuery({ name: "status", required: false, enum: ["ACTIVE", "ARCHIVED"] })
  @ApiOkResponse({ description: "Geofence zones array", type: GeofenceZoneListResponse })
  async listGeofenceZones(@Query("status") status: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.ownedVehicleIds(tenantId, req);
    const zones = await this.geofenceZonesUseCase.list(tenantId, { status: (status as any) ?? "ACTIVE" });
    const occupants = await this.vehiclesInside(tenantId, zones.map((zone) => zone.id), owned);

    // The count chip means vehicles inside the zone right now, which is not
    // the same as the vehicles assigned to watch it.
    const data = zones.map((zone) => ({
      ...withOwnAssignments(zone, owned),
      vehiclesInside: occupants.get(zone.id) ?? 0,
    }));
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create geofence zone" })
  @ApiCreatedResponse({ description: "Zone created", type: GeofenceZoneResponse })
  async createGeofenceZone(@Body() body: CreateGeofenceZoneDto, @Req() req: FleetRequestContext) {
    this.assertMayManageZones(req);
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
      const owned = await this.ownedVehicleIds(tenantId, req);
      const [zone, everyoneInside] = await Promise.all([
        this.geofenceZonesUseCase.get(tenantId, id),
        this.geofenceEvaluator.occupants(tenantId, id),
      ]);
      const occupants = onlyAllowedVehicles(everyoneInside, owned);

      const data = {
        ...withOwnAssignments(zone, owned),
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
    this.assertMayManageZones(req);
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
    this.assertMayManageZones(req);
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
      const tenantId = this.tenantIdFromRequest(req);
      const owned = await this.ownedVehicleIds(tenantId, req);
      const requested = body.vehicleIds ?? [];
      this.assertAmongOwned(owned, requested);
      const vehicleIds = await this.assignmentsKeepingOthers(tenantId, id, requested, owned);
      const zone = await this.geofenceZonesUseCase.setVehicleAssignments(tenantId, id, vehicleIds);
      return { status: true, message: "success", data: withOwnAssignments(zone, owned) };
    } catch (e) {
      if (e instanceof GeofenceZoneNotFoundError) throw new NotFoundException("Geofence zone not found");
      throw e;
    }
  }

  /* ── Maintenance Records ───────────────────────────────────────────────── */
}

/** A shared zone as a limited owner operator sees it: only their own vehicles' assignments. */
function withOwnAssignments<T extends { assignedVehicleIds: string[] }>(zone: T, owned: AllowedVehicleIds): T {
  return owned ? { ...zone, assignedVehicleIds: zone.assignedVehicleIds.filter((vehicleId) => owned.has(vehicleId)) } : zone;
}
