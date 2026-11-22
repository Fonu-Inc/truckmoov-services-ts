import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Portals, OnResource } from "@shared/access";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { MessageResponse } from "./dto/fleet.schema";
import {
  DriverLicenceReminderListResponse,
  DriverLicenceReminderResponse,
  SetDriverLicenceReminderDto,
} from "./dto/driver-licence-reminder.dto";
import {
  DriverLicenceReminderInputError,
  DriverLicenceReminderNotFoundError,
  DriverLicenceRemindersService,
  toDriverLicenceReminderView,
} from "./driver-licence-reminders.service";
import { TenantScoped } from "./tenant-scoped.decorator";

/** Set Reminder on the drivers' licence compliance tab. */
@ApiTags("Driver Licence Reminders")
@Portals("tenant")
@OnResource("tenant.drivers")
@Controller("driver-licence-reminders")
@TenantScoped()
@UseGuards(RolesGuard)
export class DriverLicenceRemindersController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(DriverLicenceRemindersService) private readonly reminders: DriverLicenceRemindersService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepository: DriverRepository,
  ) {
    super(auditLog, bus);
  }

  private owned(tenantId: string, req: FleetRequestContext) {
    return this.ownedDriverIdsFor(this.vehicleRepository, this.driverRepository, tenantId, req);
  }

  /** A limited owner operator may only touch drivers on their own vehicles; others are "not found". */
  private async assertMayTouch(tenantId: string, driverId: string, req: FleetRequestContext): Promise<void> {
    const owned = await this.owned(tenantId, req);
    if (owned && !owned.has(driverId)) throw new NotFoundException("Driver not found");
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List the licence-expiry reminders set for the account's drivers" })
  @ApiOkResponse({ type: DriverLicenceReminderListResponse })
  async list(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.owned(tenantId, req);
    const data = (await this.reminders.list(tenantId))
      .filter((reminder) => !owned || owned.has(reminder.driverId))
      .map(toDriverLicenceReminderView);
    return { status: true, message: "success", data };
  }

  @Put(":driverId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set or replace a driver's licence-expiry reminder" })
  @ApiOkResponse({ type: DriverLicenceReminderResponse })
  async set(@Param("driverId") driverId: string, @Body() body: SetDriverLicenceReminderDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertMayTouch(tenantId, driverId, req);
    try {
      const data = toDriverLicenceReminderView(await this.reminders.set(tenantId, driverId, body.recipientEmail, body.leadDays));
      return { status: true, message: "Reminder saved", data };
    } catch (error) {
      if (error instanceof DriverLicenceReminderNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof DriverLicenceReminderInputError) throw new BadRequestException({ message: error.message, field: error.field });
      throw error;
    }
  }

  @Delete(":driverId")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Stop a driver's licence-expiry reminder" })
  @ApiOkResponse({ type: MessageResponse })
  async remove(@Param("driverId") driverId: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertMayTouch(tenantId, driverId, req);
    await this.reminders.remove(tenantId, driverId);
    return { status: true, message: "Reminder removed" };
  }
}
