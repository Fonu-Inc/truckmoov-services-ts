import {
  UseGuards,
  Controller,
  Inject,
  Get,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiOkResponse } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController } from "./base.controller";
import { FleetHealthResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals } from "@shared/access";

@ApiTags("Fleet")
@Portals("public")
@Controller()
@TenantScoped()
@UseGuards(RolesGuard)
export class FleetController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
  ) {
    super(auditLog, bus);
  }

  @Get("health")
  @ApiOkResponse({ type: FleetHealthResponse })
  health(): FleetHealthResponse {
    return { status: true, message: "success", data: { service: "fleet" } };
  }

  /** Readiness probe — L14 */

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  @ApiOkResponse({ description: "Service readiness status" })
  ready(): { ready: boolean } {
    return { ready: true };
  }

  @Get("test-sentry")
  @ApiOperation({
    summary: "Trigger a test Sentry error",
    description: "Throws an unhandled error so Sentry capture can be verified.",
  })
  @ApiOkResponse({ description: "Never returns — always throws" })
  testSentry(): never {
    throw new Error("Sentry test error from fleet service");
  }
}
