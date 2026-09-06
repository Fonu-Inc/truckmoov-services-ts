import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
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
import { ReinstateDeviceUseCase, SuspendDeviceUseCase } from "./contexts/fleet/devices";
import { DeviceNotFoundError } from "./contexts/fleet/devices/domain/errors/device-not-found.error";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";
import { SuspendDeviceDto } from "./dto/vehicle.dto";

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
    @Inject(SuspendDeviceUseCase) private readonly suspendDeviceUseCase: SuspendDeviceUseCase,
    @Inject(ReinstateDeviceUseCase) private readonly reinstateDeviceUseCase: ReinstateDeviceUseCase,
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

  /**
   * Suspend a device on the platform's instruction, whatever tenant holds it.
   *
   * Platform-only: the roles here are the internal ones, never a customer's. An
   * administrator acting on a device does not know which tenant it belongs to,
   * which is why this is not on the tenant-scoped devices controller.
   */
  @Post("devices/:deviceId/suspend")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async suspendDevice(@Param("deviceId") deviceId: string, @Body() payload: SuspendDeviceDto) {
    const data = await this.runDeviceAction(() =>
      this.suspendDeviceUseCase.execute(deviceId, payload?.reason ?? null),
    );
    return { status: true, message: "Device suspended", data };
  }

  @Post("devices/:deviceId/reinstate")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async reinstateDevice(@Param("deviceId") deviceId: string) {
    const data = await this.runDeviceAction(() => this.reinstateDeviceUseCase.execute(deviceId));
    return { status: true, message: "Device reinstated", data };
  }

  private async runDeviceAction<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof DeviceNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof FleetRuleError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
