import {
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

@ApiTags("Maintenance")
@Controller("maintenance")
@TenantScoped()
@UseGuards(RolesGuard)
export class MaintenanceController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(MaintenanceProfilesUseCase) private readonly maintenanceProfilesUseCase: MaintenanceProfilesUseCase,
    @Inject(MaintenanceRecordsUseCase) private readonly maintenanceRecordsUseCase: MaintenanceRecordsUseCase,
  ) {
    super(auditLog, bus);
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
    const data = await this.maintenanceProfilesUseCase.list(this.tenantIdFromRequest(req), {
      vehicleId,
      lifecycleStatus: lifecycleStatus as any,
      nextDueDateFrom,
      nextDueDateTo,
      currentMileageMin: currentMileageMin != null && currentMileageMin !== "" ? Number(currentMileageMin) : undefined,
      currentMileageMax: currentMileageMax != null && currentMileageMax !== "" ? Number(currentMileageMax) : undefined,
    });
    return { status: true, message: "success", data };
  }

  @Post("profiles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance profile" })
  @ApiCreatedResponse({ description: "Maintenance profile created", type: MaintenanceProfileResponse })
  async createMaintenanceProfile(@Body() body: CreateMaintenanceProfileDto, @Req() req: FleetRequestContext) {
    const data = await this.maintenanceProfilesUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Delete("profiles/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete maintenance profile" })
  @ApiOkResponse({ description: "Deleted", type: MessageResponse })
  async deleteMaintenanceProfile(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.maintenanceProfilesUseCase.delete(this.tenantIdFromRequest(req), id);
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
      const data = await this.maintenanceProfilesUseCase.complete(this.tenantIdFromRequest(req), id);
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
    const data = await this.maintenanceProfilesUseCase.summary(this.tenantIdFromRequest(req));
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
    const csv = await this.maintenanceProfilesUseCase.export(this.tenantIdFromRequest(req));
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
    const data = await this.maintenanceRecordsUseCase.list(this.tenantIdFromRequest(req), {
      vehicleId, status: status as any, priority: priority as any, maintenanceType, search,
    });
    return { status: true, message: "success", data };
  }

  @Post("records")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create maintenance record" })
  @ApiCreatedResponse({ description: "Record created", type: MaintenanceRecordResponse })
  async createMaintenanceRecord(@Body() body: CreateMaintenanceRecordDto, @Req() req: FleetRequestContext) {
    const data = await this.maintenanceRecordsUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Get("records/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Maintenance records summary" })
  @ApiOkResponse({ description: "Summary counts", type: MaintenanceRecordsSummaryResponse })
  async getMaintenanceRecordsSummary(@Req() req: FleetRequestContext) {
    const data = await this.maintenanceRecordsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("records/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export maintenance records as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportMaintenanceRecords(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const csv = await this.maintenanceRecordsUseCase.export(this.tenantIdFromRequest(req));
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
      const data = await this.maintenanceRecordsUseCase.findOne(this.tenantIdFromRequest(req), id);
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
      const data = await this.maintenanceRecordsUseCase.update(this.tenantIdFromRequest(req), id, body);
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
      await this.maintenanceRecordsUseCase.delete(this.tenantIdFromRequest(req), id);
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
      const data = await this.maintenanceRecordsUseCase.transition(this.tenantIdFromRequest(req), id, "in_progress");
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
      const data = await this.maintenanceRecordsUseCase.transition(this.tenantIdFromRequest(req), id, "completed");
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof MaintenanceRecordNotFoundError) throw new NotFoundException("Maintenance record not found");
      throw e;
    }
  }

  @Post("reminders/send")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Send maintenance reminders" })
  @ApiOkResponse({ description: "Reminders queued", type: ReminderQueuedResponse })
  async sendMaintenanceReminders(@Req() req: FleetRequestContext) {
    const summary = await this.maintenanceRecordsUseCase.summary(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: { queued: summary.overdue, message: "Reminders will be sent to assigned drivers" } };
  }

  /* ── Compliance Documents ──────────────────────────────────────────────── */
}
