import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Portals, OnResource } from "@shared/access";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { MessageResponse } from "./dto/fleet.schema";
import {
  CreateFleetGroupDto,
  FleetGroupListResponse,
  FleetGroupResponse,
  UpdateFleetGroupDto,
} from "./dto/fleet-group.dto";
import type { FleetGroup } from "./fleet-groups.repository";
import {
  FleetGroupInputError,
  FleetGroupNameTakenError,
  FleetGroupNotFoundError,
  FleetGroupsUseCase,
  toFleetGroupView,
} from "./fleet-groups.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";
import type { AllowedVehicleIds } from "./allowed-vehicles";

function mapped(error: unknown): unknown {
  if (error instanceof FleetGroupNotFoundError) return new NotFoundException(error.message);
  if (error instanceof FleetGroupNameTakenError) return new ConflictException(error.message);
  if (error instanceof FleetGroupInputError) return new BadRequestException({ message: error.message, field: error.field });
  return error;
}

/** A fleet as a limited owner operator sees it: only their own vehicles. */
function forCaller(group: FleetGroup, owned: AllowedVehicleIds) {
  return toFleetGroupView(owned ? { ...group, vehicleIds: group.vehicleIds.filter((id) => owned.has(id)) } : group);
}

/**
 * Fleets: named groups of the account's vehicles. They belong to the whole
 * account, like geofences, so an owner operator inside someone else's
 * organisation sees only their own vehicles in them and cannot change them.
 */
@ApiTags("Fleets")
@Portals("tenant")
@OnResource("tenant.vehicles")
@Controller("fleets")
@TenantScoped()
@UseGuards(RolesGuard)
export class FleetGroupsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(FleetGroupsUseCase) private readonly fleets: FleetGroupsUseCase,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
  ) {
    super(auditLog, bus);
  }

  private assertMayManage(req: FleetRequestContext): void {
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Fleet not found");
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List fleets, newest first, with their vehicles" })
  @ApiOkResponse({ type: FleetGroupListResponse })
  async list(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.ownedVehicleIdsFor(this.vehicleRepository, tenantId, req);
    const data = (await this.fleets.list(tenantId)).map((group) => forCaller(group, owned));
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create a fleet" })
  @ApiCreatedResponse({ type: FleetGroupResponse })
  async create(@Body() body: CreateFleetGroupDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      const data = toFleetGroupView(await this.fleets.create(this.tenantIdFromRequest(req), body));
      return { status: true, message: "Fleet created", data };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Change a fleet's name, description, vehicles or violations setting" })
  @ApiOkResponse({ type: FleetGroupResponse })
  async update(@Param("id") id: string, @Body() body: UpdateFleetGroupDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      const data = toFleetGroupView(await this.fleets.update(this.tenantIdFromRequest(req), id, body));
      return { status: true, message: "Fleet updated", data };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete a fleet; its vehicles are not affected" })
  @ApiOkResponse({ type: MessageResponse })
  async remove(@Param("id") id: string, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      await this.fleets.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "Fleet deleted" };
    } catch (error) {
      throw mapped(error);
    }
  }
}
