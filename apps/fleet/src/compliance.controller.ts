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
import { ComplianceReminderSweepService } from "./compliance-reminder-sweep.service";
import { ComplianceDocumentsUseCase, ComplianceDocumentNotFoundError } from "./compliance-documents.use-case";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import {
  SetComplianceReminderDto,
  RenewComplianceDocumentDto,
  CreateComplianceDocumentDto,
  UpdateComplianceDocumentDto,
  UploadComplianceDocumentDto,
} from "./dto/compliance-document.dto";
import {
  ComplianceSummaryResponse,
  ComplianceDocumentResponse,
  ComplianceDocumentListResponse,
  ReminderQueuedResponse,
  MessageResponse,
} from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Compliance")
@Controller("compliance")
@TenantScoped()
@UseGuards(RolesGuard)
export class ComplianceController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ComplianceDocumentsUseCase) private readonly complianceDocumentsUseCase: ComplianceDocumentsUseCase,
    @Inject(ComplianceReminderSweepService) private readonly complianceReminderSweepService: ComplianceReminderSweepService,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
  ) {
    super(auditLog, bus);
  }

  /**
   * An owner-operator only ever sees compliance documents for vehicles they
   * own — derived from their own identity, never from a caller-supplied
   * vehicleId. Returns undefined for every other role, meaning "no extra
   * scoping beyond tenant."
   */
  private async ownerOperatorVehicleIds(
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<string[] | undefined> {
    if (req.user?.role !== Role.OWNER_OPERATOR) return undefined;
    const userId = req.user?.userId;
    if (!userId) return [];
    const vehicles = await this.vehicleRepository.findAllByOwnerOperatorId(userId, tenantId);
    return vehicles.map((v) => v.id);
  }

  @Get("documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List compliance documents" })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "documentType", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["valid", "expiring", "expired"] })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiOkResponse({ description: "Compliance documents array", type: ComplianceDocumentListResponse })
  async listComplianceDocuments(
    @Query("vehicleId") vehicleId: string,
    @Query("documentType") documentType: string,
    @Query("status") status: string,
    @Query("search") search: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicleIds = await this.ownerOperatorVehicleIds(tenantId, req);
    const data = await this.complianceDocumentsUseCase.list(tenantId, {
      vehicleId: vehicleIds ? undefined : vehicleId, vehicleIds, documentType, status: status as any, search,
    });
    return { status: true, message: "success", data };
  }

  @Post("documents")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Create compliance document" })
  @ApiCreatedResponse({ description: "Document created", type: ComplianceDocumentResponse })
  async createComplianceDocument(@Body() body: CreateComplianceDocumentDto, @Req() req: FleetRequestContext) {
    const data = await this.complianceDocumentsUseCase.create(this.tenantIdFromRequest(req), body);
    return { status: true, message: "success", data };
  }

  @Get("documents/history")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "List compliance documents including superseded ones",
    description: "Renewing a document supersedes the previous record rather than overwriting it. This returns the whole chain, which is what proves cover on a past date.",
  })
  @ApiQuery({ name: "vehicleId", required: false, type: String })
  @ApiQuery({ name: "documentType", required: false, type: String })
  @ApiOkResponse({ description: "Compliance documents array", type: ComplianceDocumentListResponse })
  async listComplianceDocumentHistory(
    @Query("vehicleId") vehicleId: string,
    @Query("documentType") documentType: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicleIds = await this.ownerOperatorVehicleIds(tenantId, req);
    const data = await this.complianceDocumentsUseCase.history(tenantId, {
      vehicleId: vehicleIds ? undefined : vehicleId, vehicleIds, documentType,
    });
    return { status: true, message: "success", data };
  }

  @Get("documents/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Compliance documents summary" })
  @ApiOkResponse({ description: "Summary counts", type: ComplianceSummaryResponse })
  async getComplianceDocumentsSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicleIds = await this.ownerOperatorVehicleIds(tenantId, req);
    const data = await this.complianceDocumentsUseCase.summary(tenantId, { vehicleIds });
    return { status: true, message: "success", data };
  }

  @Get("documents/export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Export compliance documents as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportComplianceDocuments(@Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const tenantId = this.tenantIdFromRequest(req);
    const vehicleIds = await this.ownerOperatorVehicleIds(tenantId, req);
    const csv = await this.complianceDocumentsUseCase.export(tenantId, { vehicleIds });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=compliance-documents.csv");
    res.send(csv);
  }

  @Patch("documents/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Update compliance document" })
  @ApiOkResponse({ description: "Updated", type: ComplianceDocumentResponse })
  async updateComplianceDocument(@Param("id") id: string, @Body() body: UpdateComplianceDocumentDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.update(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Delete("documents/:id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Delete compliance document" })
  @ApiOkResponse({ description: "Deleted", type: MessageResponse })
  async deleteComplianceDocument(@Param("id") id: string, @Req() req: FleetRequestContext) {
    try {
      await this.complianceDocumentsUseCase.delete(this.tenantIdFromRequest(req), id);
      return { status: true, message: "success" };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("documents/:id/upload")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set file URL for a compliance document" })
  @ApiOkResponse({ description: "File URL updated", type: ComplianceDocumentResponse })
  async uploadComplianceDocument(@Param("id") id: string, @Body() body: UploadComplianceDocumentDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.setFileUrl(this.tenantIdFromRequest(req), id, body.fileUrl, body.fileSize ?? null);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("documents/:id/renew")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Renew a compliance document" })
  @ApiOkResponse({ description: "Document renewed", type: ComplianceDocumentResponse })
  async renewComplianceDocument(@Param("id") id: string, @Body() body: RenewComplianceDocumentDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.renew(this.tenantIdFromRequest(req), id, body);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Patch("documents/:id/reminder")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Set reminder days for a compliance document" })
  @ApiOkResponse({ description: "Reminder updated", type: ComplianceDocumentResponse })
  async setComplianceDocumentReminder(@Param("id") id: string, @Body() body: SetComplianceReminderDto, @Req() req: FleetRequestContext) {
    try {
      const data = await this.complianceDocumentsUseCase.updateReminder(this.tenantIdFromRequest(req), id, body.reminderDays);
      return { status: true, message: "success", data };
    } catch (e) {
      if (e instanceof ComplianceDocumentNotFoundError) throw new NotFoundException("Compliance document not found");
      throw e;
    }
  }

  @Post("reminders/send")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Send compliance reminder emails" })
  @ApiOkResponse({ description: "Reminders queued", type: ReminderQueuedResponse })
  async sendComplianceReminders() {
    const result = await this.complianceReminderSweepService.run();
    return {
      status: true,
      message: "success",
      data: {
        queued: result.documents,
        message: `Queued reminders for ${result.documents} document(s) across ${result.tenants} tenant(s)`,
      },
    };
  }

  /* ── Fleet Financials ──────────────────────────────────────────────────── */
}
