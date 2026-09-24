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
import { Roles, Role, RolesGuard, SkipTenantScope } from "@shared/rbac";
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
import {
  DEVICE_REPOSITORY,
  ReinstateDeviceUseCase,
  SuspendDeviceUseCase,
} from "./contexts/fleet/devices";
import type { DeviceRepository } from "./contexts/fleet/devices/domain/repositories/device.repository";
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
/** The tenant drawer shows a handful of rows; an operator manages the rest elsewhere. */
const DRAWER_ROW_LIMIT = 25;

@ApiExcludeController()
@SkipTenantScope()
@Controller("internal")
@UseGuards(RolesGuard)
export class InternalFleetController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
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

  /**
   * A tenant's fleet, for the platform admin's tenant drawer.
   *
   * Capped rather than paginated: the drawer is a review surface showing a
   * handful of rows, and an administrator who needs the whole roster opens the
   * tenant's own pages. Cross-tenant, so it carries the platform roles.
   */
  @Get("tenants/:tenantId/vehicles")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async tenantVehicles(@Param("tenantId") tenantId: string) {
    const vehicles = await this.vehicles.findAll({ tenantId });
    const rows = (vehicles as unknown as Array<Record<string, unknown>>)
      .slice(0, DRAWER_ROW_LIMIT)
      .map((vehicle) => ({
        vehicleId: String(vehicle["id"]),
        registrationNumber: vehicle["registrationNumber"] ?? null,
        make: vehicle["make"] ?? null,
        model: vehicle["model"] ?? null,
        status: vehicle["status"] ?? null,
      }));

    return {
      status: true,
      message: "success",
      // The total is the whole fleet, not the page: the usage bar counts every
      // vehicle even when only twenty-five are listed.
      data: { total: vehicles.length, limit: DRAWER_ROW_LIMIT, items: rows },
    };
  }

  @Get("tenants/:tenantId/drivers")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async tenantDrivers(@Param("tenantId") tenantId: string) {
    const drivers = await this.drivers.findAll({ tenantId });
    const rows = (drivers as unknown as Array<Record<string, unknown>>)
      .slice(0, DRAWER_ROW_LIMIT)
      .map((driver) => ({
        driverId: String(driver["id"]),
        name: driver["name"] ?? null,
        phone: driver["phone"] ?? null,
        licenseNumber: driver["licenseNumber"] ?? null,
        status: driver["status"] ?? null,
      }));

    return {
      status: true,
      message: "success",
      data: { total: drivers.length, limit: DRAWER_ROW_LIMIT, items: rows },
    };
  }

  @Get("tenants/:tenantId/devices")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async tenantDevices(@Param("tenantId") tenantId: string) {
    const devices = await this.devices.findAll({ tenantId });
    const rows = devices.slice(0, DRAWER_ROW_LIMIT).map((device) => ({
      deviceId: device.id,
      manufacturer: device.manufacturer,
      model: device.model,
      imei: device.imei,
      status: device.status,
      assignedVehicleId: device.vehicleId,
    }));

    return {
      status: true,
      message: "success",
      data: { total: devices.length, limit: DRAWER_ROW_LIMIT, items: rows },
    };
  }

  /**
   * A snapshot of one record, for a support ticket's auto-attached context.
   *
   * Read here rather than accepted from the client: a ticket that carries
   * device state the reporter typed is a ticket that can claim a device was
   * offline when it never was, and support would act on it.
   */
  @Get("tenants/:tenantId/context/:resource/:recordId")
  @Roles(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN, Role.PLATFORM_ADMIN)
  async contextSnapshot(
    @Param("tenantId") tenantId: string,
    @Param("resource") resource: string,
    @Param("recordId") recordId: string,
  ) {
    const snapshot = await this.buildSnapshot(tenantId, resource, recordId);
    if (!snapshot) throw new NotFoundException("Record not found");

    return { status: true, message: "success", data: snapshot };
  }

  private async buildSnapshot(
    tenantId: string,
    resource: string,
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    if (resource === "device") {
      const device = await this.devices.findById(recordId, tenantId);
      if (!device) return null;
      return {
        imei: device.imei,
        manufacturer: device.manufacturer,
        model: device.model,
        status: device.status,
        lifecycleStatus: device.lifecycleStatus,
        // Derived from the last fix rather than stored: a device is offline
        // because nothing has arrived, which no column records on its own.
        healthStatus: deviceHealth(device.lastSeen),
        lastSeen: device.lastSeen,
      };
    }

    if (resource === "vehicle") {
      const vehicle = await this.vehicles.findById(recordId, tenantId);
      if (!vehicle) return null;
      const primitives = vehicle as unknown as Record<string, unknown>;
      return {
        registrationNumber: primitives["registrationNumber"] ?? null,
        make: primitives["make"] ?? null,
        model: primitives["model"] ?? null,
        status: primitives["status"] ?? null,
      };
    }

    return null;
  }
}

/** Offline once nothing has arrived for longer than a missed ping allows. */
const DEVICE_OFFLINE_AFTER_MS = 15 * 60 * 1000;

function deviceHealth(lastSeen: string | null): "online" | "offline" | "never_reported" {
  if (!lastSeen) return "never_reported";
  const fixedAt = Date.parse(lastSeen);
  if (Number.isNaN(fixedAt)) return "never_reported";
  return Date.now() - fixedAt <= DEVICE_OFFLINE_AFTER_MS ? "online" : "offline";
}
