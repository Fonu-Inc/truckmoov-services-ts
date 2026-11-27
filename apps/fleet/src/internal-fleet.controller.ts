import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Roles, Role, RolesGuard, SkipTenantScope } from "@shared/rbac";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { PlatformActorGuard, PlatformOrTrackingGuard } from "./platform-actor.guard";
import { TenantHoldUseCases } from "./contexts/fleet/tenant-hold/application/tenant-hold.use-cases";
import { TenantHoldDto, TenantHoldPreviewDto } from "./dto/tenant-hold.dto";
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
  DecommissionDeviceUseCase,
  DeviceIdentityDirectory,
  ImportPlatformStockUseCase,
  SuspendDeviceUseCase,
  deviceHeartbeat,
  heartbeatWindow,
} from "./contexts/fleet/devices";
import { RecordDeviceTelemetryUseCase } from "./contexts/fleet/devices/application/use-cases/record-device-telemetry.use-case";
import type { DeviceRepository } from "./contexts/fleet/devices/domain/repositories/device.repository";
import { Device } from "./contexts/fleet/devices/domain/entities/device.entity";
import type {
  DeviceLifecycleStatus,
  DeviceProtocol,
  DeviceStatus,
} from "./contexts/fleet/devices/domain/entities/device.entity";
import {
  PlatformAssignDevicesDto,
  PlatformAllocateStockDto,
  PlatformStockImportDto,
  PlatformUpdateDeviceDto,
} from "./dto/platform-device.dto";
import {
  DEVICE_CATALOG_PORT,
  type DeviceCatalogPort,
} from "./contexts/fleet/devices/domain/ports/device-catalog.port";
import { DeviceNotFoundError } from "./contexts/fleet/devices/domain/errors/device-not-found.error";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";
import { SuspendDeviceDto } from "./dto/vehicle.dto";
import { BeginJobVerificationDto, InstalledUnitDto } from "./dto/device-installation.dto";
import { InstallationHandoverUseCases } from "./contexts/fleet/devices/application/use-cases/installation-handover.use-cases";
import { VehicleNotFoundError, VehicleQuotaExceededError } from "./contexts/fleet/vehicles";
import { AccessClient, Portals, OnResource } from "@shared/access";
import {
  DEVICE_LIFECYCLE_LABELS,
  TEST_TELEMETRY_DISABLED_MESSAGE,
  testTelemetryEnabled,
  testTelemetryNote,
} from "@shared/devices";
import { TestTelemetryDto } from "./dto/test-telemetry.dto";
import { SYSTEM_TENANT_ID } from "@shared/identity";
import { devicesStillNeeded, orderPlatformStock } from "./contexts/fleet/devices/domain/platform-stock";
import { AppConfigService } from "@shared/config";
import {
  deviceExport,
  driverExport,
  isTenantExportScope,
  TENANT_EXPORT_SCOPES,
  vehicleExport,
  type TenantExportScope,
  type TenantExportTable,
} from "./tenant-export-rows";

/**
 * Facts about a tenant's fleet that another service needs to make a decision.
 *
 * Hidden from the public documentation: no browser calls it. Auth asks here
 * rather than reading fleet's tables, so the two services keep one answer to
 * "how many vehicles does this tenant have".
 */
/** The tenant drawer shows a handful of rows; an operator manages the rest elsewhere. */
const DRAWER_ROW_LIMIT = 25;
const UNFITTABLE_LIFECYCLE: readonly string[] = ["faulty", "suspended", "decommissioned"];
/** A job lists a handful of units; a page of them at most. */
const MAX_DEVICE_IDS = 100;
/** Tracking pages the held-device list; this is the most it may take at once. */
const MAX_HELD_PAGE = 5000;
const DEFAULT_IDENTITY_PAGE = 1000;
const MAX_IDENTITY_PAGE = 5000;

/** The forms a number is stored in: bare digits, with a plus, and, for Nigeria, with a local leading zero. */
function phoneVariants(raw: string | undefined): string[] {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return [];
  const local = digits.startsWith("234") ? [`0${digits.slice(3)}`] : [];
  return [digits, `+${digits}`, ...local];
}

@ApiExcludeController()
@Portals("service")
@OnResource("tenant.vehicles")
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
    @Inject(DEVICE_CATALOG_PORT) private readonly catalog: DeviceCatalogPort,
    @Inject(InstallationHandoverUseCases) private readonly handover: InstallationHandoverUseCases,
    @Inject(DecommissionDeviceUseCase) private readonly decommissionDeviceUseCase: DecommissionDeviceUseCase,
    @Inject(TenantHoldUseCases) private readonly tenantHolds: TenantHoldUseCases,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DeviceIdentityDirectory) private readonly identities: DeviceIdentityDirectory,
    @Optional() @Inject(AccessClient) private readonly access?: AccessClient,
    @Optional() @Inject(ImportPlatformStockUseCase) private readonly importPlatformStock?: ImportPlatformStockUseCase,
    @Optional() @Inject(RecordDeviceTelemetryUseCase) private readonly recordTelemetry?: RecordDeviceTelemetryUseCase,
  ) {
    super(auditLog, bus);
  }

  /**
   * Which vehicles an owner operator's live socket may carry: null for the
   * whole tenant, or the ids they own when they hold a seat inside someone
   * else's organisation. Same rule as ownerOperatorIdFromRequest; an unknown
   * organisation narrows rather than widens.
   */
  @Portals("service")
  @Get("live-scope/:userId")
  @Roles(Role.DISPATCHER)
  async liveScope(@Req() req: FleetRequestContext, @Param("userId") userId: string) {
    if (req.user?.service !== "realtime" && req.user?.service !== "notification") throw new NotFoundException();
    const tenantId = this.tenantIdFromRequest(req);
    const access = await this.access?.get(userId);
    if (access === null || access?.active === false || (access && access.tenantId !== tenantId)) {
      throw new NotFoundException();
    }
    if (access?.organizationType === OWNER_OPERATOR_ORGANISATION_TYPE) {
      return { status: true, message: "success", data: { vehicleIds: null } };
    }
    const owned = await this.vehicles.findAllByOwnerOperatorId(userId, tenantId);
    return { status: true, message: "success", data: { vehicleIds: owned.map((vehicle) => vehicle.id) } };
  }

  /**
   * Active vehicles only, matching what the quota counts. A decommissioned
   * vehicle is not evidence that a fleet has outgrown its plan.
   */
  @Portals("tenant", "service")
  @Get("vehicle-count")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Portals("tenant", "service")
  @Get("tenant-counts")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @UseGuards(PlatformActorGuard)
  async suspendDevice(@Param("deviceId") deviceId: string, @Body() payload: SuspendDeviceDto) {
    const data = await this.runDeviceAction(() =>
      this.suspendDeviceUseCase.execute(deviceId, payload?.reason ?? null),
    );
    return { status: true, message: "Device suspended", data };
  }

  @Post("devices/:deviceId/reinstate")
  @UseGuards(PlatformActorGuard)
  async reinstateDevice(@Param("deviceId") deviceId: string) {
    const data = await this.runDeviceAction(() => this.reinstateDeviceUseCase.execute(deviceId));
    return { status: true, message: "Device reinstated", data };
  }

  /** Permanent, so platform-only like suspension; tenants can only mark a device faulty. */
  @Post("devices/:deviceId/decommission")
  @UseGuards(PlatformActorGuard)
  async decommissionDevice(@Param("deviceId") deviceId: string) {
    const data = await this.runDeviceAction(() => this.decommissionDeviceUseCase.execute(deviceId));
    return { status: true, message: "Device decommissioned", data };
  }

  /**
   * Corrects a device record from the platform inventory.
   *
   * Tenant-scoped editing cannot serve this screen: the administrator does not
   * know which tenant holds the device. The fields are descriptive (make,
   * model, firmware, protocol, service state); assignment has its own route
   * below because it moves the device between tenants.
   */
  @Patch("devices/:deviceId")
  @UseGuards(PlatformActorGuard)
  async updateDevice(@Param("deviceId") deviceId: string, @Body() payload: PlatformUpdateDeviceDto) {
    const device = await this.devices.findByIdAcrossTenants(deviceId);
    if (!device) throw new NotFoundException(`Device ${deviceId} was not found`);

    try {
      const updated = device.update({
        manufacturer: payload.manufacturer,
        model: payload.model,
        firmwareVersion: payload.firmwareVersion,
        protocol: payload.protocol as DeviceProtocol | undefined,
        port: payload.port,
        lifecycleStatus: payload.lifecycleStatus as DeviceLifecycleStatus | undefined,
        status: payload.status as DeviceStatus | undefined,
      });
      await this.devices.save(updated);
      return { status: true, message: "Device updated", data: updated.toPrimitives() };
    } catch (error) {
      if (error instanceof FleetRuleError) throw new BadRequestException(error.message);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /**
   * Records that one or more devices now belong to a tenant.
   *
   * Device assignment in fleet is vehicle assignment, which needs a tenant to
   * scope the lookup. The platform is moving stock between tenants, so it sets
   * the holder and the assigned date directly; the device is then assignable
   * to a vehicle from the tenant's own screen.
   */
  @Post("devices/assign")
  @UseGuards(PlatformActorGuard)
  async assignDevicesToTenant(@Body() payload: PlatformAssignDevicesDto) {
    const found = await Promise.all(
      payload.deviceIds.map((id) => this.devices.findByIdAcrossTenants(id)),
    );
    const missing = payload.deviceIds.filter((_, index) => !found[index]);
    if (missing.length > 0) {
      throw new NotFoundException(`Device ${missing[0]} was not found`);
    }

    const now = new Date().toISOString();
    const updated: Device[] = [];
    for (const device of found as Device[]) {
      if (device.lifecycleStatus === "suspended" || device.lifecycleStatus === "decommissioned") {
        throw new BadRequestException(
          `A ${device.lifecycleStatus} device cannot be assigned to a tenant`,
        );
      }
      const moved = device.update({
        tenantId: payload.tenantId,
        // The tenant holds the device but no vehicle yet. `assigned` lifecycle
        // requires a vehicle, so the holder is recorded as the operational
        // status and the device stays ready for the tenant to fit.
        lifecycleStatus: "assignable",
        status: "assigned",
        assignedAt: now,
        vehicleId: null,
        holdCause: null,
      });
      await this.devices.save(moved);
      updated.push(moved);
    }

    return {
      status: true,
      message: "Devices assigned",
      data: { tenantId: payload.tenantId, updated: updated.length },
    };
  }

  /**
   * Tops a tenant up to `target` devices from platform stock, oldest first.
   *
   * Platform stock is what the system tenant holds. The target is a total, so
   * a repeat call moves nothing the tenant already has. A device taken by a
   * concurrent caller is skipped, and a short stock moves what exists.
   */
  @Post("devices/allocate-from-stock")
  @UseGuards(PlatformActorGuard)
  async allocateFromStock(@Body() payload: PlatformAllocateStockDto) {
    const held = (await this.devices.findAll({ tenantId: payload.tenantId })).filter(
      (device) => device.lifecycleStatus !== "decommissioned",
    ).length;
    const needed = devicesStillNeeded(payload.target, held);
    const deviceIds: string[] = [];

    if (needed > 0) {
      const stock = orderPlatformStock(await this.devices.findAll({ tenantId: SYSTEM_TENANT_ID }));
      const now = new Date().toISOString();
      for (const device of stock) {
        if (deviceIds.length >= needed) break;
        const moved = device.update({
          tenantId: payload.tenantId,
          lifecycleStatus: "assignable",
          status: "assigned",
          assignedAt: now,
          vehicleId: null,
          holdCause: null,
        });
        if (await this.devices.claimStockDevice(device, moved)) deviceIds.push(device.id);
      }
    }

    return {
      status: true,
      message: "Devices allocated",
      data: {
        tenantId: payload.tenantId,
        deviceIds,
        held: held + deviceIds.length,
        shortfall: needed - deviceIds.length,
      },
    };
  }

  /**
   * Registers devices the platform holds itself, ready for allocate-from-stock.
   *
   * An IMEI already on any account is counted and left untouched, so a repeat
   * call creates nothing. `line` in a rejection is the row's 1-based position
   * in this request.
   */
  @Post("devices/stock/import")
  @UseGuards(PlatformActorGuard)
  async importStock(@Body() payload: PlatformStockImportDto) {
    if (!this.importPlatformStock) throw new ServiceUnavailableException("Stock import is not available");
    const data = await this.importPlatformStock.execute(payload.rows);
    return { status: true, message: "Stock imported", data };
  }

  /**
   * Dev-only: publishes the fix the gateway would, so the real telemetry
   * listener verifies the device. Nothing here touches device state.
   */
  @Post("devices/test-telemetry")
  @UseGuards(PlatformActorGuard)
  async sendTestTelemetry(@Body() payload: TestTelemetryDto) {
    if (!testTelemetryEnabled()) throw new ForbiddenException(TEST_TELEMETRY_DISABLED_MESSAGE);

    const device = await this.devices.findLiveByImei(payload.imei);
    if (!device) throw new NotFoundException("No device with that IMEI");

    if (!this.recordTelemetry) throw new ServiceUnavailableException("Telemetry recording is not available");

    const before = device.verificationStatus;
    // Fleet may not publish tracking's location event on the bus, so this runs the use case the listener runs.
    await this.recordTelemetry.execute({
      tenantId: device.tenantId,
      deviceId: device.id,
      imei: device.imei,
      reportedAt: new Date().toISOString(),
      reportedProtocol: device.reportedProtocol ?? undefined,
    });

    const after = (await this.devices.findById(device.id, device.tenantId)) ?? device;

    return {
      status: true,
      message: "Test telemetry published",
      data: {
        published: true,
        imei: device.imei,
        verificationStatusBefore: before,
        verificationStatusAfter: after.verificationStatus,
        lifecycleStatusAfter: after.lifecycleStatus,
        note: testTelemetryNote(before, after.verificationStatus, after.lifecycleStatus),
      },
    };
  }

  private async runDeviceAction<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof DeviceNotFoundError || error instanceof VehicleNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) throw new BadRequestException(error.message);
      if (error instanceof VehicleQuotaExceededError) throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Holds a tenant's devices, vehicles and share links. Nothing is detached or deleted. */
  @Post("tenants/:tenantId/suspend")
  @UseGuards(PlatformActorGuard)
  async suspendTenant(@Param("tenantId") tenantId: string, @Body() payload: TenantHoldDto) {
    const counts = await this.tenantHolds.suspend(tenantId, payload.cause, payload.reason ?? "");
    return { status: true, message: "Tenant assets held", data: { tenantId, ...counts, complete: true } };
  }

  @Post("tenants/:tenantId/reinstate")
  @UseGuards(PlatformActorGuard)
  async reinstateTenant(@Param("tenantId") tenantId: string, @Body() payload: TenantHoldDto) {
    const counts = await this.tenantHolds.reinstate(tenantId, payload.cause);
    return { status: true, message: "Tenant assets released", data: { tenantId, ...counts, complete: true } };
  }

  /** What a suspension would hold, for every listed tenant in one call. */
  @Post("tenants/suspension-preview")
  @UseGuards(PlatformActorGuard)
  async suspensionPreview(@Body() payload: TenantHoldPreviewDto) {
    const items = await this.tenantHolds.preview(payload.tenantIds);
    return { status: true, message: "success", data: { items } };
  }

  /** Every held device, paged, so tracking can heal events it missed. */
  @Get("suspended-devices")
  @UseGuards(PlatformOrTrackingGuard)
  async suspendedDevices(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    const size = Math.min(Math.max(Number.parseInt(limit ?? "", 10) || MAX_HELD_PAGE, 1), MAX_HELD_PAGE);
    const data = await this.tenantHolds.heldDevices(size, cursor?.trim() || null);
    return { status: true, message: "success", data };
  }

  /** Every live device's identity, paged by device id, so tracking can fill its IMEI cache. */
  @Get("device-identities")
  @UseGuards(PlatformOrTrackingGuard)
  async deviceIdentities(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    const size = Math.min(Math.max(Number.parseInt(limit ?? "", 10) || DEFAULT_IDENTITY_PAGE, 1), MAX_IDENTITY_PAGE);
    const data = await this.identities.page(size, cursor?.trim() || null);
    return { status: true, message: "success", data };
  }

  /** One device's identity by IMEI, for tracking's read-through on a cache miss. */
  @Get("device-identities/:imei")
  @UseGuards(PlatformOrTrackingGuard)
  async deviceIdentity(@Param("imei") imei: string) {
    const data = await this.identities.byImei(imei);
    if (!data) throw new NotFoundException("Device not found");
    return { status: true, message: "success", data };
  }

  /** An installer started a job. Devices already waiting or verified are left alone. */
  @Post("tenants/:tenantId/devices/verification")
  @UseGuards(PlatformActorGuard)
  async beginJobVerification(@Param("tenantId") tenantId: string, @Body() payload: BeginJobVerificationDto) {
    const items = await this.handover.beginVerification(tenantId, payload.deviceIds);
    return { status: true, message: "success", data: { items } };
  }

  /** An installer completed a job: the unit's vehicle joins the fleet once per registration, with its device. */
  @Post("tenants/:tenantId/installed-units")
  @UseGuards(PlatformActorGuard)
  async installedUnit(@Param("tenantId") tenantId: string, @Body() payload: InstalledUnitDto) {
    const data = await this.runDeviceAction(() => this.handover.handOver(tenantId, payload));
    return { status: true, message: "Unit handed over", data };
  }

  /**
   * A tenant's fleet, for the platform admin's tenant drawer.
   *
   * Capped rather than paginated: the drawer is a review surface showing a
   * handful of rows, and an administrator who needs the whole roster opens the
   * tenant's own pages. Cross-tenant, so it carries the platform roles.
   */
  @Get("tenants/:tenantId/vehicles")
  @UseGuards(PlatformActorGuard)
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

  /**
   * The registration plate for each vehicle id asked about, so a platform screen that only
   * holds an id (a SIM's vehicle) can name it. An id that is not this tenant's is left out.
   */
  @Get("tenants/:tenantId/vehicle-labels")
  @UseGuards(PlatformActorGuard)
  async tenantVehicleLabels(@Param("tenantId") tenantId: string, @Query("ids") ids?: string) {
    const wanted = new Set((ids ?? "").split(",").map(id => id.trim()).filter(Boolean).slice(0, 200));
    const vehicles = (await this.vehicles.findAll({ tenantId })) as unknown as Array<Record<string, unknown>>;
    const labels: Record<string, string> = {};
    for (const vehicle of vehicles) {
      const id = String(vehicle["id"]);
      if (wanted.has(id))
        labels[id] = String(vehicle["registrationNumber"] ?? vehicle["plateNumber"] ?? id);
    }
    return { status: true, message: "success", data: { labels } };
  }

  /**
   * Which drivers, in any tenant, list this number. Platform staff use it to
   * tie a WhatsApp conversation to a person; nothing beyond who and where.
   */
  @Get("drivers/by-phone")
  @UseGuards(PlatformActorGuard)
  async driversByPhone(@Query("phone") phone?: string) {
    const numbers = phoneVariants(phone);
    if (numbers.length === 0) throw new BadRequestException("phone is required");
    const found = await this.drivers.findByNumbersAcrossTenants(numbers, DRAWER_ROW_LIMIT);
    const items = (found as unknown as Array<Record<string, unknown>>).map((driver) => ({
      driverId: String(driver["id"]),
      name: driver["name"] ?? null,
      tenantId: String(driver["tenantId"]),
      status: driver["status"] ?? null,
    }));
    return { status: true, message: "success", data: { items } };
  }

  @Get("tenants/:tenantId/drivers")
  @UseGuards(PlatformActorGuard)
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

  /**
   * With `ids`, the named devices this tenant holds, as the installer's job
   * details show them. A device held by another tenant is left out, which is
   * how auth checks a unit binding belongs to the order's customer.
   */
  @Get("tenants/:tenantId/devices")
  @UseGuards(PlatformActorGuard)
  async tenantDevices(@Param("tenantId") tenantId: string, @Query("ids") ids?: string, @Query("unfitted") unfitted?: string) {
    if (ids !== undefined) return this.devicesByIds(tenantId, ids);
    if (unfitted === "true") return this.unfittedDevices(tenantId);
    const devices = await this.devices.findAll({ tenantId });
    const rows = devices.slice(0, DRAWER_ROW_LIMIT).map((device) => ({
      deviceId: device.id,
      manufacturer: device.manufacturer,
      model: device.model,
      imei: device.imei,
      status: device.status,
      assignedVehicleId: device.vehicleId,
      holdCause: device.holdCause,
    }));

    return {
      status: true,
      message: "success",
      data: { total: devices.length, limit: DRAWER_ROW_LIMIT, items: rows },
    };
  }

  /**
   * Every row of one resource for a tenant, as columns and rows, for the
   * platform's data export. Uncapped, unlike the drawer lists above.
   */
  @Get("tenants/:tenantId/export/:scope")
  @UseGuards(PlatformActorGuard)
  async tenantExport(@Param("tenantId") tenantId: string, @Param("scope") scope: string) {
    if (!isTenantExportScope(scope)) {
      throw new BadRequestException(`scope must be one of: ${TENANT_EXPORT_SCOPES.join(", ")}`);
    }
    const table = await this.exportTable(tenantId, scope);
    return { status: true, message: "success", data: { scope, total: table.rows.length, ...table } };
  }

  private async exportTable(tenantId: string, scope: TenantExportScope): Promise<TenantExportTable> {
    if (scope === "vehicles") return vehicleExport(await this.vehicles.findAll({ tenantId }));
    if (scope === "drivers") return driverExport(await this.drivers.findAll({ tenantId }));
    return deviceExport(await this.devices.findAll({ tenantId }));
  }

  /** Uncapped: the devices a tenant holds that sit on no vehicle, are not on hold and can still be fitted. */
  private async unfittedDevices(tenantId: string) {
    const devices = await this.devices.findAll({ tenantId });
    const items = devices
      .filter((device) => !device.vehicleId && !device.holdCause && !UNFITTABLE_LIFECYCLE.includes(device.lifecycleStatus))
      .map((device) => ({ deviceId: device.id }));
    return { status: true, message: "success", data: { total: items.length, items } };
  }

  private async devicesByIds(tenantId: string, ids: string) {
    const wanted = idList(ids);
    const [devices, deviceType] = await Promise.all([this.devices.findByIds(tenantId, wanted), this.deviceTypes()]);
    const items = devices.map((device) => ({
      id: device.id,
      name: device.name,
      imei: device.imei,
      manufacturer: device.manufacturer,
      model: device.model,
      status: device.lifecycleStatus,
      statusLabel: DEVICE_LIFECYCLE_LABELS[device.lifecycleStatus],
      deviceType: deviceType(device),
      verificationStatus: device.verificationStatus,
    }));
    return { status: true, message: "success", data: { total: items.length, items } };
  }

  /** Each device's type from its catalogue model; unknown when the catalogue has none. */
  private async deviceTypes(): Promise<(device: Device) => string | null> {
    const key = (manufacturer: string, model: string) => `${manufacturer.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
    const models = await this.catalog.findAll().catch(() => []);
    const types = new Map(models.map((entry) => [key(entry.manufacturer, entry.model), entry.deviceType]));
    return (device) => types.get(key(device.manufacturer, device.model)) ?? null;
  }

  /**
   * Whether a tenant's devices are reporting; with `deviceIds`, only those.
   *
   * Read from the devices themselves rather than accepted from the caller:
   * this closes the onboarding, and a customer who says the fitting worked is
   * not evidence that the hardware is talking to us.
   */
  @Get("tenants/:tenantId/connectivity")
  @UseGuards(PlatformActorGuard)
  async tenantConnectivity(@Param("tenantId") tenantId: string, @Query("deviceIds") deviceIds?: string) {
    const devices = deviceIds === undefined
      ? await this.devices.findAll({ tenantId })
      : await this.devices.findByIds(tenantId, idList(deviceIds));

    const items = devices.map((device) => ({
      deviceId: device.id,
      imei: device.imei,
      manufacturer: device.manufacturer,
      model: device.model,
      assignedVehicleId: device.vehicleId,
      verificationStatus: device.verificationStatus,
      lastSeen: device.lastSeen,
      reporting: device.verificationStatus === "verified",
    }));

    return {
      status: true,
      message: "success",
      data: {
        total: items.length,
        reporting: items.filter((item) => item.reporting).length,
        items,
      },
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
  @UseGuards(PlatformActorGuard)
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
    if (resource === "device") return this.deviceSnapshot(tenantId, recordId);
    if (resource === "vehicle") return this.vehicleSnapshot(tenantId, recordId);
    return null;
  }

  /** The wizard may know a device only by its IMEI, so either identifies it. */
  private async deviceSnapshot(tenantId: string, recordId: string): Promise<Record<string, unknown> | null> {
    const device = (await this.devices.findById(recordId, tenantId)) ?? (await this.devices.findByImei(recordId, tenantId));
    if (!device) return null;
    return {
      deviceId: device.id,
      imei: device.imei,
      manufacturer: device.manufacturer,
      model: device.model,
      status: device.status,
      lifecycleStatus: device.lifecycleStatus,
      // Derived from the last fix rather than stored: a device is offline
      // because nothing has arrived, which no column records on its own.
      healthStatus: deviceHeartbeat(device.lastSeen, heartbeatWindow(this.config.fleet.deviceOnlineThresholdSeconds)),
      lastSeen: device.lastSeen,
    };
  }

  /** Likewise a vehicle by its registration. */
  private async vehicleSnapshot(tenantId: string, recordId: string): Promise<Record<string, unknown> | null> {
    const vehicle = (await this.vehicles.findById(recordId, tenantId))
      ?? (await this.vehicles.findByPlateNumber(recordId, tenantId));
    if (!vehicle) return null;
    const primitives = vehicle as unknown as Record<string, unknown>;
    return {
      vehicleId: vehicle.id,
      registrationNumber: primitives["registrationNumber"] ?? null,
      make: primitives["make"] ?? null,
      model: primitives["model"] ?? null,
      status: primitives["status"] ?? null,
    };
  }
}

function idList(ids: string): string[] {
  return ids.split(",").map((id) => id.trim()).filter(Boolean).slice(0, MAX_DEVICE_IDS);
}
