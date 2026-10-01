import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Res,
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
  Query,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { MaintenanceReminderService } from "./maintenance-reminder.service";
import { SaveMaintenanceReminderScheduleDto } from "./dto/maintenance-reminder.dto";
import {
  MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY,
  REMINDER_LEAD_DAY_OPTIONS,
  type MaintenanceReminderSchedule,
  type MaintenanceReminderScheduleRepository,
} from "./contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import {
  MaintenanceRecordResponse,
  ServiceCategoryListResponse,
  MaintenanceRecordsSummaryResponse,
  MaintenanceRecordListResponse,
  MaintenanceProfileResponse,
  MaintenanceProfilesSummaryResponse,
  ReminderQueuedResponse,
  MaintenanceProfileListResponse,
  MessageResponse,
} from "./dto/fleet.schema";
import { CreateMaintenanceProfileDto } from "./dto/maintenance-profile.dto";
import { CreateMaintenanceRecordDto, UpdateMaintenanceRecordDto } from "./dto/maintenance-record.dto";
import { MaintenanceProfilesUseCase, MaintenanceProfileNotFoundError } from "./maintenance-profiles.use-case";
import { MaintenanceRecordsUseCase, MaintenanceRecordNotFoundError } from "./maintenance-records.use-case";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("Maintenance")
@Portals("tenant")
@OnResource("tenant.maintenance")
@Controller("maintenance")
@TenantScoped()
@UseGuards(RolesGuard)
export class MaintenanceController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(MaintenanceProfilesUseCase) private readonly maintenanceProfilesUseCase: MaintenanceProfilesUseCase,
    @Inject(MaintenanceRecordsUseCase) private readonly maintenanceRecordsUseCase: MaintenanceRecordsUseCase,
    @Inject(MAINTENANCE_REMINDER_SCHEDULE_REPOSITORY)
    private readonly reminderSchedules: MaintenanceReminderScheduleRepository,
    @Inject(MaintenanceReminderService) private readonly reminderService: MaintenanceReminderService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
  ) {
    super(auditLog, bus);
  }

  private ownedVehicleIds(tenantId: string, req: FleetRequestContext) {
    return this.ownedVehicleIdsFor(this.vehicleRepository, tenantId, req);
  }

  /** The reminder schedule covers the whole account, so a limited owner operator cannot change or run it. */
  private assertMayManageReminders(req: FleetRequestContext): void {
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Reminder schedule not found");
  }

  @Get("profiles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance profiles" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "lifecycleStatus", required: false, enum: ["overdue", "due", "upcoming", "completed"] })
  @ApiQuery({ name: "nextDueDateFrom", required: false, type: String })
  @ApiQuery({ name: "nextDueDateTo", required: false, type: String })
  @ApiQuery({ name: "currentMileageMin", required: false, type: Number, description: "Minimum current mileage (km)" })
  @ApiQuery({ name: "currentMileageMax", required: false, type: Number, description: "Maximum current mileage (km)" })
  @ApiOkResponse({ description: "Maintenance profiles array", type: MaintenanceProfileListResponse })
  async listMaintenanceProfiles(
    @Query("vehicleId") vehicleId: string,
    @Query("lifecycleStatus") lifecycleStatus: string,
    @Query("nextDueDateFrom") nextDueDateFrom: string,
    @Query("nextDueDateTo") nextDueDateTo: string,
    @Query("currentMileageMin") currentMileageMin: string,
    @Query("currentMileageMax") currentMileageMax: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.maintenanceProfilesUseCase.list(tenantId, {
      vehicleId,
      lifecycleStatus: lifecycleStatus as any,
      nextDueDateFrom,
      nextDueDateTo,
      currentMileageMin: currentMileageMin != null && currentMileageMin !== "" ? Number(currentMileageMin) : undefined,
      currentMileageMax: currentMileageMax != null && currentMileageMax !== "" ? Number(currentMileageMax) : undefined,
    }, await this.ownedVehicleIds(tenantId, req));
    return { status: true, message: "success", data };
  }

  @Post("profiles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance profile" })
  @ApiCreatedResponse({ description: "Maintenance profile created", type: MaintenanceProfileResponse })
  async createMaintenanceProfile(@Body() body: CreateMaintenanceProfileDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    this.assertAmongOwned(await this.ownedVehicleIds(tenantId, req), [body.vehicleId]);
    const data = await this.maintenanceProfilesUseCase.create(tenantId, body);
    return { status: true, message: "success", data };
  }

  @Delete("profiles/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete maintenance profile" })
  @ApiOkResponse({ description: "Deleted", type: MessageResponse })
  async deleteMaintenanceProfile(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      await this.maintenanceProfilesUseCase.delete(tenantId, id, await this.ownedVehicleIds(tenantId, req));
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof MaintenanceProfileNotFoundError) throw new NotFoundException("Maintenance profile not found");
      throw e;
    }
  }

  @Post("profiles/:id/complete")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Mark maintenance profile as completed" })
  @ApiOkResponse({ description: "Completed", type: MaintenanceProfileResponse })
  async completeMaintenanceProfile(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const data = await this.maintenanceProfilesUseCase.complete(tenantId, id, await this.ownedVehicleIds(tenantId, req));
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceProfileNotFoundError) throw new NotFoundException("Maintenance profile not found");
      throw e;
    }
  }

  @Get("profiles/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Maintenance profiles summary" })
  @ApiOkResponse({ description: "Summary counts", type: MaintenanceProfilesSummaryResponse })
  async getMaintenanceProfilesSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.maintenanceProfilesUseCase.summary(tenantId, await this.ownedVehicleIds(tenantId, req));
    return { status: true, message: "success", data };
  }

  @Get("service-categories")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance service categories" })
  @ApiOkResponse({ description: "Service categories list", type: ServiceCategoryListResponse })
  async getMaintenanceServiceCategories() {
    return { status: true, message: "success", data: this.maintenanceProfilesUseCase.serviceCategories() };
  }

  @Get("profiles/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export maintenance profiles as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportMaintenanceProfiles(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const tenantId = this.tenantIdFromRequest(req);
    const csv = await this.maintenanceProfilesUseCase.export(tenantId, await this.ownedVehicleIds(tenantId, req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=maintenance-profiles.csv");
    res.send(csv);
  }

  /* ── Geofence Zones ────────────────────────────────────────────────────── */

  @Get("records")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List maintenance records" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["scheduled", "in_progress", "completed", "cancelled", "overdue"] })
  @ApiQuery({ name: "priority", required: false, enum: ["low", "medium", "high", "critical"] })
  @ApiQuery({ name: "maintenanceType", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiOkResponse({ description: "Maintenance records array", type: MaintenanceRecordListResponse })
  async listMaintenanceRecords(
    @Query("vehicleId") vehicleId: string,
    @Query("status") status: string,
    @Query("priority") priority: string,
    @Query("maintenanceType") maintenanceType: string,
    @Query("search") search: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.maintenanceRecordsUseCase.list(tenantId, {
      vehicleId, status: status as any, priority: priority as any, maintenanceType, search,
    }, await this.ownedVehicleIds(tenantId, req));
    return { status: true, message: "success", data };
  }

  @Post("records")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance record" })
  @ApiCreatedResponse({ description: "Record created", type: MaintenanceRecordResponse })
  async createMaintenanceRecord(@Body() body: CreateMaintenanceRecordDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const allowed = await this.ownedVehicleIds(tenantId, req);
    const data = await this.runFleetUseCase(() => this.maintenanceRecordsUseCase.create(tenantId, body, allowed));
    return { status: true, message: "success", data };
  }

  @Get("records/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Maintenance records summary" })
  @ApiOkResponse({ description: "Summary counts", type: MaintenanceRecordsSummaryResponse })
  async getMaintenanceRecordsSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.maintenanceRecordsUseCase.summary(tenantId, await this.ownedVehicleIds(tenantId, req));
    return { status: true, message: "success", data };
  }

  @Get("records/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export maintenance records as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportMaintenanceRecords(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const tenantId = this.tenantIdFromRequest(req);
    const csv = await this.maintenanceRecordsUseCase.export(tenantId, await this.ownedVehicleIds(tenantId, req));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=maintenance-records.csv");
    res.send(csv);
  }

  @Get("records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Get maintenance record" })
  @ApiOkResponse({ description: "Maintenance record", type: MaintenanceRecordResponse })
  async getMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const data = await this.maintenanceRecordsUseCase.findOne(tenantId, id, await this.ownedVehicleIds(tenantId, req));
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Patch("records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update maintenance record" })
  @ApiOkResponse({ description: "Updated", type: MaintenanceRecordResponse })
  async updateMaintenanceRecord(@Param("id") id: string, @Body() body: UpdateMaintenanceRecordDto, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const allowed = await this.ownedVehicleIds(tenantId, req);
      const data = await this.runFleetUseCase(() => this.maintenanceRecordsUseCase.update(tenantId, id, body, allowed));
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Delete("records/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete maintenance record" })
  @ApiOkResponse({ description: "Deleted", type: MessageResponse })
  async deleteMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      await this.maintenanceRecordsUseCase.delete(tenantId, id, await this.ownedVehicleIds(tenantId, req));
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("records/:id/start")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Start maintenance record" })
  @ApiOkResponse({ description: "Started", type: MaintenanceRecordResponse })
  async startMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const allowed = await this.ownedVehicleIds(tenantId, req);
      const data = await this.maintenanceRecordsUseCase.transition(tenantId, id, "in_progress", allowed);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("records/:id/complete")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Complete maintenance record" })
  @ApiOkResponse({ description: "Completed", type: MaintenanceRecordResponse })
  async completeMaintenanceRecord(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const allowed = await this.ownedVehicleIds(tenantId, req);
      const data = await this.maintenanceRecordsUseCase.transition(tenantId, id, "completed", allowed);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Get("reminders/schedule")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Get the maintenance reminder schedule",
    description: "Returns the standing reminder for the calling tenant, or null when none is configured.",
  })
  @ApiOkResponse({ description: "Schedule returned" })
  async getReminderSchedule(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const schedule = this.ownerOperatorIdFromRequest(req) ? null : await this.reminderSchedules.findByTenantId(tenantId);
    return {
      status: true,
      message: "success",
      data: { schedule: schedule ? presentSchedule(schedule) : null, leadDayOptions: REMINDER_LEAD_DAY_OPTIONS },
    };
  }

  @Post("reminders/schedule")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Create or update the maintenance reminder schedule",
    description:
      "Stores a standing reminder. The sweep mails the recipient whenever maintenance falls due inside the lead window, or is already overdue. Nothing is sent by this call.",
  })
  @ApiCreatedResponse({ description: "Schedule saved" })
  @ApiBadRequestResponse({ description: "Invalid recipient email or lead window" })
  async saveReminderSchedule(
    @Body() payload: SaveMaintenanceReminderScheduleDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    this.assertMayManageReminders(req);
    const existing = await this.reminderSchedules.findByTenantId(tenantId);
    const now = new Date();

    const schedule = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      recipientEmail: payload.recipientEmail.trim().toLowerCase(),
      leadDays: payload.leadDays,
      enabled: payload.enabled ?? true,
      lastRunAt: existing?.lastRunAt ?? null,
      lastSentCount: existing?.lastSentCount ?? null,
      createdBy: req.user?.userId ?? "system",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.reminderSchedules.save(schedule);

    // Shown so the modal can say what the next run will cover, without the
    // caller having to guess the window.
    const dueNow = await this.reminderService.findDue(schedule, now);

    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: schedule.id,
      action: "maintenance.reminder_schedule_saved",
      summary: `Maintenance reminders set for ${schedule.recipientEmail}, ${schedule.leadDays} days ahead`,
      metadata: { leadDays: schedule.leadDays, enabled: schedule.enabled },
    });

    return {
      status: true,
      message: "Reminder schedule saved",
      data: { schedule: presentSchedule(schedule), dueInWindow: dueNow.length },
    };
  }

  @Delete("reminders/schedule")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Stop maintenance reminders" })
  @ApiOkResponse({ description: "Schedule removed" })
  async deleteReminderSchedule(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    this.assertMayManageReminders(req);
    await this.reminderSchedules.deleteByTenantId(tenantId);
    return { status: true, message: "Reminder schedule removed", data: { schedule: null } };
  }

  @Post("reminders/send")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Run the reminder now",
    description:
      "Sends the reminder immediately using the stored schedule, without waiting for the sweep. Requires a schedule to exist.",
  })
  @ApiOkResponse({ description: "Reminder sent", type: ReminderQueuedResponse })
  @ApiBadRequestResponse({ description: "No reminder schedule is configured" })
  async sendMaintenanceReminders(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    this.assertMayManageReminders(req);
    const schedule = await this.reminderSchedules.findByTenantId(tenantId);
    if (!schedule) {
      throw new BadRequestException("Set a reminder schedule before sending one");
    }

    const sent = await this.reminderService.runForTenant(schedule);
    return {
      status: true,
      message: "success",
      data: { queued: sent.length, recipient: schedule.recipientEmail },
    };
  }

  /* ── Compliance Documents ──────────────────────────────────────────────── */
}

function presentSchedule(schedule: MaintenanceReminderSchedule) {
  return {
    id: schedule.id,
    recipientEmail: schedule.recipientEmail,
    leadDays: schedule.leadDays,
    enabled: schedule.enabled,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    lastSentCount: schedule.lastSentCount,
    updatedAt: schedule.updatedAt.toISOString(),
  };
}
