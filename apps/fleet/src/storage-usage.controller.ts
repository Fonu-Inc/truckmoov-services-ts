import { Controller, Get, Inject, NotFoundException, Req, UseGuards } from "@nestjs/common";
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { Portals, OnResource } from "@shared/access";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { FleetStorageUsageResponse } from "./dto/storage-usage.dto";
import { StorageUsageService } from "./storage-usage.service";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Storage")
@Portals("tenant")
@OnResource("tenant.organization")
@Controller("storage")
@TenantScoped()
@UseGuards(RolesGuard)
export class StorageUsageController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(StorageUsageService) private readonly storageUsage: StorageUsageService,
  ) {
    super(auditLog, bus);
  }

  @Get("usage")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "File count and bytes stored per fleet category (POD, waybills, compliance)" })
  @ApiOkResponse({ type: FleetStorageUsageResponse })
  @ApiNotFoundResponse({ description: "Owner operator inside another company: storage is the company's" })
  async usage(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    // The totals are the company's and not owner-scoped, so a limited owner operator gets nothing.
    if (this.ownerOperatorIdFromRequest(req)) throw new NotFoundException("Not found");
    return { status: true, message: "success", data: { categories: await this.storageUsage.forTenant(tenantId) } };
  }
}
