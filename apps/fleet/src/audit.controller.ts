import {
  Inject,
  Get,
  Req,
  Controller,
  UseGuards,
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditEntityType, AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { AuditEntryListResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals } from "@shared/access";

@ApiTags("Audit")
@Portals("tenant")
@Controller("audit")
@TenantScoped()
@UseGuards(RolesGuard)
export class AuditController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
  ) {
    super(auditLog, bus);
  }

  /**
   * A hash chain nobody recomputes proves nothing, so the check is exposed
   * rather than left to a one-off script. Read-only, and it reads the whole
   * chain: a partial check cannot tell a removed entry from one never written.
   */
  @Get("verify")
  @Roles(Role.ENTERPRISE_ADMIN)
  @ApiOperation({ summary: "Verify the audit log has not been tampered with" })
  @ApiOkResponse({ description: "Chain verification result" })
  async verifyAuditChain(@Req() req: FleetRequestContext) {
    const result = await this.auditLog.verifyChain(this.tenantIdFromRequest(req));
    return {
      status: true,
      message: result.intact ? "audit chain intact" : "audit chain broken",
      data: result,
    };
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Activity/audit log — M06" })
  @ApiQuery({ name: "entityType", required: false, enum: ["job", "vehicle", "driver", "device", "fuel", "alert", "document", "geofence"] })
  @ApiQuery({ name: "entityId", required: false, type: String })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Audit entries (newest first)", type: AuditEntryListResponse })
  async getAuditLog(
    @Req() req: FleetRequestContext,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string,
  ) {
    const entries = await this.auditLog.query(this.tenantIdFromRequest(req), {
      entityType: entityType as AuditEntityType | undefined,
      entityId,
      action,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { status: true, message: "success", data: entries };
  }
}
