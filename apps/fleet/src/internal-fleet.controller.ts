import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { AuditLogService } from "./audit-log.service";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";

/**
 * Facts about a tenant's fleet that another service needs to make a decision.
 *
 * Hidden from the public documentation: no browser calls it. Auth asks here
 * rather than reading fleet's tables, so the two services keep one answer to
 * "how many vehicles does this tenant have".
 */
@ApiExcludeController()
@Controller("internal")
@UseGuards(RolesGuard)
export class InternalFleetController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
  ) {
    super(auditLog, bus);
  }

  /**
   * Active vehicles only, matching what the quota counts. A decommissioned
   * vehicle is not evidence that a fleet has outgrown its plan.
   */
  @Get("vehicle-count")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  async vehicleCount(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const active = await this.vehicles.findAll({ tenantId, status: "active" });

    return { status: true, message: "success", data: { tenantId, activeVehicles: active.length } };
  }
}
