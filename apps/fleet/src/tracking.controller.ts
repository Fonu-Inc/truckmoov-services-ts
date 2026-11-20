import { Controller, Get, Inject, NotFoundException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import { LiveTrackingUseCase } from "./contexts/fleet/tracking/application/live-tracking.use-case";
import {
  ShareLinkExpiredError,
  ShareVehicleLocationUseCase,
  ViewSharedLocationUseCase,
} from "./contexts/fleet/tracking/application/share-location.use-cases";
import { ALERT_REPOSITORY, type AlertRepository } from "./contexts/fleet/alerts/domain/alert.repository";
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";

@ApiTags("Live Tracking")
@Portals("tenant")
@OnResource("tenant.tracking")
@Controller("tracking")
@TenantScoped()
@UseGuards(RolesGuard)
export class TrackingController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(LiveTrackingUseCase) private readonly liveTrackingUseCase: LiveTrackingUseCase,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(ShareVehicleLocationUseCase) private readonly shareLocationUseCase: ShareVehicleLocationUseCase,
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepository,
  ) {
    super(auditLog, bus);
  }

  @Get("live")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Live tracking snapshot",
    description:
      "Every vehicle's latest position, status, driver and active job, with the status-bar counts. Drawn once on load; the socket carries changes after that.",
  })
  @ApiOkResponse({ description: "Fleet snapshot for the Live Tracking map" })
  async live(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.liveTrackingUseCase.execute({
      tenantId,
      ownedVehicleIds: await this.ownedVehicleIdsFor(this.vehicles, tenantId, req),
    });
    return { status: true, message: "success", data };
  }

  @Get("vehicles")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Vehicle list panel",
    description: "The same rows as the snapshot, filtered by the search box.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiOkResponse({ description: "Vehicles matching the search" })
  async vehicleList(@Query("query") query: string | undefined, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.liveTrackingUseCase.execute({
      tenantId,
      ownedVehicleIds: await this.ownedVehicleIdsFor(this.vehicles, tenantId, req),
      query,
    });
    return { status: true, message: "success", data };
  }

  @Get("alerts")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Map alerts panel",
    description: "Recent alerts for the fleet, newest first.",
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Recent alerts" })
  async alertFeed(@Query("limit") limit: string | undefined, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.ownedVehicleIdsFor(this.vehicles, tenantId, req);

    // Alerts are keyed on the vehicle, so an owner operator sees only alerts
    // raised on vehicles they hold.
    const recent = await this.alerts.findAll(tenantId, {
      vehicleIdIn: owned === null ? undefined : [...owned],
      limit: this.alertLimit(limit),
    });
    const items = recent.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      vehicleId: alert.vehicleId,
      details: alert.details,
      triggeredAt: alert.triggeredAt.toISOString(),
    }));

    return { status: true, message: "success", data: { total: items.length, items } };
  }

  @Post("vehicles/:id/share")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Share a vehicle's location",
    description:
      "Mints a private link that follows the vehicle's current job and expires with it. The URL is returned once and cannot be shown again.",
  })
  @ApiOkResponse({ description: "The share link" })
  async shareLocation(@Param("id") vehicleId: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const owned = await this.ownedVehicleIdsFor(this.vehicles, tenantId, req);
    // Out of scope reads as missing, so an id is not worth guessing.
    if (owned !== null && !owned.has(vehicleId)) throw new NotFoundException("Vehicle not found");

    const data = await this.shareLocationUseCase.execute({
      tenantId,
      vehicleId,
      createdBy: req.user?.userId ?? "unknown",
    });

    await this.recordActivity(req, {
      entityType: "vehicle",
      entityId: vehicleId,
      action: "vehicle.location.shared",
      summary: "Vehicle location shared",
      metadata: { expiresAt: data.expiresAt, reusedExistingLink: data.alreadyShared },
    });

    return { status: true, message: "success", data };
  }

  private alertLimit(raw: string | undefined): number {
    const parsed = Number(raw ?? 50);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.min(Math.floor(parsed), 200);
  }
}
