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
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "./contexts/fleet/drivers/domain/repositories/driver.repository";

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
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
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

  /**
   * Vehicle and driver counts together, for a caller that needs both as one
   * capacity figure — the aggregator network screen's per-operator card.
   * Drivers counted as active/available: suspended or offline is not
   * dispatchable capacity, even though the vehicle still exists.
   */
  @Get("tenant-counts")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  async tenantCounts(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const [activeVehicles, allDrivers] = await Promise.all([
      this.vehicles.findAll({ tenantId, status: "active" }),
      this.drivers.findAll({ tenantId }),
    ]);
    const driverCount = allDrivers.filter((d) => d.status === "active" || d.status === "available").length;

    return {
      status: true,
      message: "success",
      data: { tenantId, vehicleCount: activeVehicles.length, driverCount },
    };
  }
}
