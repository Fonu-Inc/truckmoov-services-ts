import {
  UseGuards,
  Controller,
  Inject,
  Get,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiOkResponse } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController } from "./base.controller";
import { ListCarriersUseCase } from "./contexts/fleet/carriers";
import { CarrierListResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Carriers")
@Controller("carriers")
@TenantScoped()
@UseGuards(RolesGuard)
export class CarriersController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListCarriersUseCase) private readonly listCarriersUseCase: ListCarriersUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({ summary: "List SIM carriers catalog" })
  @ApiOkResponse({ type: CarrierListResponse })
  async listCarriers(): Promise<CarrierListResponse> {
    const data = await this.listCarriersUseCase.execute();
    return { status: true, message: "success", data } as unknown as CarrierListResponse;
  }
}
