import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Portals, OnResource } from "@shared/access";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { MessageResponse } from "./dto/fleet.schema";
import {
  CreateViolationRuleDto,
  SetViolationStatusDto,
  UpdateViolationRuleDto,
  ViolationResponse,
  ViolationRuleListResponse,
  ViolationRuleResponse,
  ViolationSummaryResponse,
} from "./dto/violation.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { RULE_ENTITIES, ViolationRuleInputError, type RuleEntity, type ViolationStatus } from "./violations.domain";
import { ViolationNotFoundError, ViolationRuleNotFoundError, ViolationsService, type Owned } from "./violations.service";

function mapped(error: unknown): unknown {
  if (error instanceof ViolationRuleNotFoundError || error instanceof ViolationNotFoundError) return new NotFoundException(error.message);
  if (error instanceof ViolationRuleInputError) return new BadRequestException({ message: error.message, field: error.field });
  return error;
}

function entityParam(value: unknown, required: true): RuleEntity;
function entityParam(value: unknown, required: false): RuleEntity | undefined;
function entityParam(value: unknown, required: boolean): RuleEntity | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value === "string" && (RULE_ENTITIES as readonly string[]).includes(value)) return value as RuleEntity;
  throw new BadRequestException({ message: "entity must be drivers or vehicles", field: "entity" });
}

/**
 * Violation rules on the drivers and vehicles Violations pages (TD-23). Rules
 * belong to the whole account, so an owner operator inside someone else's
 * organisation can read them but not change them.
 */
@ApiTags("Violations")
@Portals("tenant")
@OnResource("tenant.drivers")
@Controller("violation-rules")
@TenantScoped()
@UseGuards(RolesGuard)
export class ViolationRulesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ViolationsService) private readonly violations: ViolationsService,
  ) {
    super(auditLog, bus);
  }

  private assertMayManage(req: FleetRequestContext): void {
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Violation rule not found");
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List violation rules, newest first, with how many violations each has raised" })
  @ApiQuery({ name: "entity", required: false, enum: RULE_ENTITIES })
  @ApiOkResponse({ type: ViolationRuleListResponse })
  async list(@Query("entity") entity: string | undefined, @Req() req: FleetRequestContext) {
    const data = await this.violations.listRules(this.tenantIdFromRequest(req), entityParam(entity, false));
    return { status: true, message: "success", data };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create a violation rule" })
  @ApiCreatedResponse({ type: ViolationRuleResponse })
  async create(@Body() body: CreateViolationRuleDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      return { status: true, message: "Violation rule created", data: await this.violations.createRule(this.tenantIdFromRequest(req), body) };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Change a violation rule, including switching it on or off" })
  @ApiOkResponse({ type: ViolationRuleResponse })
  async update(@Param("id") id: string, @Body() body: UpdateViolationRuleDto, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      return { status: true, message: "Violation rule updated", data: await this.violations.updateRule(this.tenantIdFromRequest(req), id, body) };
    } catch (error) {
      throw mapped(error);
    }
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete a violation rule; the violations it raised stay" })
  @ApiOkResponse({ type: MessageResponse })
  async remove(@Param("id") id: string, @Req() req: FleetRequestContext) {
    this.assertMayManage(req);
    try {
      await this.violations.deleteRule(this.tenantIdFromRequest(req), id);
      return { status: true, message: "Violation rule deleted" };
    } catch (error) {
      throw mapped(error);
    }
  }
}

/** Violations raised by the rules, as the drivers and vehicles Violations pages show them. */
@ApiTags("Violations")
@Portals("tenant")
@OnResource("tenant.drivers")
@Controller("violations")
@TenantScoped()
@UseGuards(RolesGuard)
export class ViolationsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ViolationsService) private readonly violations: ViolationsService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepository: DriverRepository,
  ) {
    super(auditLog, bus);
  }

  private async owned(tenantId: string, req: FleetRequestContext): Promise<Owned> {
    const vehicles = await this.ownedVehicleIdsFor(this.vehicleRepository, tenantId, req);
    if (!vehicles) return null;
    const drivers = await this.ownedDriverIdsFor(this.vehicleRepository, this.driverRepository, tenantId, req);
    return { vehicles, drivers: drivers ?? new Set() };
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Violations in a period, with per-driver (or per-vehicle) totals, quota use and repeat offenders" })
  @ApiQuery({ name: "entity", required: true, enum: RULE_ENTITIES })
  @ApiQuery({ name: "period_days", required: false, type: Number, description: "Default 30, at most 365" })
  @ApiOkResponse({ type: ViolationSummaryResponse })
  async summary(@Query("entity") entity: string, @Query("period_days") periodDays: string | undefined, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const days = periodDays === undefined ? 30 : Number(periodDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new BadRequestException({ message: "period_days must be a whole number from 1 to 365", field: "period_days" });
    }
    const data = await this.violations.summary(tenantId, entityParam(entity, true), days, await this.owned(tenantId, req));
    return { status: true, message: "success", data };
  }

  @Patch(":id/status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Mark a violation open, under review or resolved" })
  @ApiOkResponse({ type: ViolationResponse })
  async setStatus(@Param("id") id: string, @Body() body: SetViolationStatusDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    try {
      const data = await this.violations.setStatus(tenantId, id, body.status as ViolationStatus, await this.owned(tenantId, req));
      return { status: true, message: "Violation updated", data };
    } catch (error) {
      throw mapped(error);
    }
  }
}
