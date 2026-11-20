import {
  Inject,
  Get,
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
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController } from "./base.controller";
import { ListDataBundlesUseCase } from "./contexts/fleet/carriers";
import { DataBundleListQueryDto } from "./dto/carrier.dto";
import { DataBundleListResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("Data Bundles")
@Portals("tenant")
@OnResource("tenant.bundles")
@Controller("data-bundles")
@TenantScoped()
@UseGuards(RolesGuard)
export class DataBundlesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListDataBundlesUseCase) private readonly listDataBundlesUseCase: ListDataBundlesUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({ summary: "List SIM data bundles catalog" })
  @ApiQuery({ name: "carrierId", required: false, type: String })
  @ApiOkResponse({ type: DataBundleListResponse })
  async listDataBundles(@Query() query: DataBundleListQueryDto): Promise<DataBundleListResponse> {
    const data = await this.listDataBundlesUseCase.execute({ carrierId: query.carrierId });
    return { status: true, message: "success", data } as unknown as DataBundleListResponse;
  }

  /** Retrieve GPS devices currently registered against fleet vehicles */
}
