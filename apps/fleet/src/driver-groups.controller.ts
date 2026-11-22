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
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { MessageResponse } from "./dto/fleet.schema";
import {
  CreateDriverGroupDto,
  DriverGroupListResponse,
  DriverGroupResponse,
  UpdateDriverGroupDto,
} from "./dto/driver-group.dto";
import type { DriverGroup } from "./driver-groups.repository";
import {
  DriverGroupInputError,
  DriverGroupNameTakenError,
  DriverGroupNotFoundError,
  DriverGroupsUseCase,
  toDriverGroupView,
} from "./driver-groups.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";

function mapped(error: unknown): unknown {
  if (error instanceof DriverGroupNotFoundError) return new NotFoundException(error.message);
  if (error instanceof DriverGroupNameTakenError) return new ConflictException(error.message);
  if (error instanceof DriverGroupInputError) return new BadRequestException({ message: error.message, field: error.field });
  return error;
}

/** A group as a limited owner operator sees it: only the drivers on their own vehicles. */
function forCaller(group: DriverGroup, owned: Set<string> | null) {
  return toDriverGroupView(owned ? { ...group, driverIds: group.driverIds.filter((id) => owned.has(id)) } : group);
}

/**
 * Driver groups: named groups of the account's drivers. Like fleets they belong
 * to the whole account, so an owner operator inside someone else's organisation
 * sees only their own drivers in them and cannot change them.
 */
@ApiTags("Driver Groups")
@Portals("tenant")
@OnResource("tenant.drivers")
@Controller("driver-groups")
@TenantScoped()
@UseGuards(RolesGuard)
export class DriverGroupsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(DriverGroupsUseCase) private readonly groups: DriverGroupsUseCase,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepository: DriverRepository,
  ) {
    super(auditLog, bus);
  }

  private assertMayManage(req: FleetRequestContext): void {
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Driver group not found");
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List driver groups, newest first, with their drivers" })
  @ApiOkResponse({ type: DriverGroupListResponse })
  async list(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.ownedDriverIdsFor(this.vehicleRepository, this.driverRepository, tenantId, req);
    const data = (await this.groups.list(tenantId)).map((group) => forCaller(group, owned));
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create a driver group" })
  @ApiCreatedResponse({ type: DriverGroupResponse })
  async create(@Body() body: CreateDriverGroupDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      const data = toDriverGroupView(await this.groups.create(this.tenantIdFromRequest(req), body));
      return { status: true, message: "Driver group created", data };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Change a driver group's name, description, drivers or violations setting" })
  @ApiOkResponse({ type: DriverGroupResponse })
  async update(@Param("id") id: string, @Body() body: UpdateDriverGroupDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      const data = toDriverGroupView(await this.groups.update(this.tenantIdFromRequest(req), id, body));
      return { status: true, message: "Driver group updated", data };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete a driver group; its drivers are not affected" })
  @ApiOkResponse({ type: MessageResponse })
  async remove(@Param("id") id: string, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      await this.groups.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "Driver group deleted" };
    } catch (error) {
      throw mapped(error);
    }
  }
}
