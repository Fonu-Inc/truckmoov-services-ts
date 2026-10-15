import { BadRequestException, ConflictException, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { clientIpFrom, type IncomingLike } from "@shared/http";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from "@shared/rbac";
import { randomUUID } from "node:crypto";
import { AuditLogService, type AuditEntityType } from "./audit-log.service";
import { DeviceNotFoundError } from "./contexts/fleet/devices";
import { WaybillNotFoundError } from "./contexts/fleet/waybills/domain/errors/waybill.errors";
import { registrationKey } from "./contexts/fleet/waybills/domain/vehicle-registration";
import { InvoiceNotFoundError } from "./contexts/fleet/waybills/application/use-cases/invoice-lifecycle.use-cases";
import { PricingRuleNotFoundError } from "./contexts/fleet/waybills/application/use-cases/pricing-rule.use-cases";
import { DriverNotFoundError } from "./contexts/fleet/drivers";
import { VehicleNotFoundError, VehicleQuotaExceededError } from "./contexts/fleet/vehicles";
import { FleetQuotaExceededError } from "./quota.service";
import { VehicleCapacityError } from "./contexts/fleet/vehicles/domain/vehicle-capacity";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";

export type FleetRequestContext = {
  user?: {
    tenantId?: string;
    userId?: string;
    role?: string;
    email?: string;
    service?: string;
    organizationType?: string | null;
  };
  ip?: string;
  headers?: IncomingLike["headers"];
  socket?: IncomingLike["socket"];
};

export abstract class BaseFleetController {
  protected readonly logger = new Logger(this.constructor.name);

  // Property-injected so no subclass constructor has to pass it along.
  @Inject(AppConfigService) protected readonly appConfig?: AppConfigService;

  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
  ) {}

  /**
   * The owner operator the caller is, when they are one. Tenant is the outer
   * boundary; this is the inner one, because an owner operator can hold a seat
   * inside an enterprise or aggregator tenant and must not see the rest of it.
   */
  /**
   * The owner operator whose vehicles this caller is limited to, or undefined
   * when they are not limited to any.
   *
   * The role means two things. In an owner-operator organisation it is the
   * organisation's own owner, who runs the whole fleet along with whoever they
   * invite. In any other organisation it is an independent operator the
   * organisation has brought in, who sees only their own vehicles. An unknown
   * organisation type is treated as the second case, so a failure to find out
   * narrows access rather than widening it.
   */
  protected ownerOperatorIdFromRequest(req: FleetRequestContext): string | undefined {
    if (req.user?.role !== Role.OWNER_OPERATOR) return undefined;
    if (req.user.organizationType === OWNER_OPERATOR_ORGANISATION_TYPE) return undefined;
    return req.user?.userId ?? "__no_owner_operator__";
  }

  /**
   * The vehicles an owner operator may see. Null means the caller sees the
   * whole tenant. Vehicle ids are the scoping key for anything hung off a
   * vehicle — positions, geofence alerts, devices — so the lookup lives here
   * rather than being repeated per controller.
   */
  /**
   * The ids of the vehicles an owner operator owns, read through a vehicle
   * lister, or null for every other role, who are not limited to their own.
   */
  protected async ownedVehicleIdsVia(
    lister: { execute(query: { tenantId: string; ownerOperatorId?: string }): Promise<unknown[]> },
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<Set<string> | null> {
    const ownerOperatorId = this.ownerOperatorIdFromRequest(req);
    if (!ownerOperatorId) return null;

    const vehicles = (await lister.execute({ tenantId, ownerOperatorId })) as Array<{ id: string }>;
    return new Set(vehicles.map((vehicle) => vehicle.id));
  }

  /**
   * The registrationKey()s of an owner operator's own vehicles, or null for
   * every other role. Waybills and invoices name a vehicle by its plate, not
   * its id, so this is their scoping key.
   */
  protected async ownedRegistrationKeysVia(
    lister: { execute(query: { tenantId: string; ownerOperatorId?: string }): Promise<unknown[]> },
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<Set<string> | null> {
    const ownerOperatorId = this.ownerOperatorIdFromRequest(req);
    if (!ownerOperatorId) return null;

    const vehicles = (await lister.execute({ tenantId, ownerOperatorId })) as Array<{ plateNumber?: string }>;
    return new Set(vehicles.map((vehicle) => registrationKey(vehicle.plateNumber)).filter(Boolean));
  }

  /** An owner operator may act only on their own vehicles; a stranger's reads as not found. */
  protected async assertOwnsVehicle(
    lister: { execute(query: { tenantId: string; ownerOperatorId?: string }): Promise<unknown[]> },
    tenantId: string,
    vehicleId: string,
    req: FleetRequestContext,
  ): Promise<void> {
    this.assertAmongOwned(await this.ownedVehicleIdsVia(lister, tenantId, req), [vehicleId]);
  }

  /** Refuses, as not found, any vehicle outside the owned set. Null owns everything. */
  protected assertAmongOwned(owned: ReadonlySet<string> | null, vehicleIds: Iterable<string>): void {
    if (owned === null) return;
    for (const vehicleId of vehicleIds) {
      if (!owned.has(vehicleId)) throw new NotFoundException("Vehicle not found");
    }
  }

  protected async ownedVehicleIdsFor(
    repository: { findAllByOwnerOperatorId(ownerOperatorId: string, tenantId: string): Promise<Array<{ id: string }>> },
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<Set<string> | null> {
    const ownerOperatorId = this.ownerOperatorIdFromRequest(req);
    if (!ownerOperatorId) return null;

    const vehicles = await repository.findAllByOwnerOperatorId(ownerOperatorId, tenantId);
    return new Set(vehicles.map((vehicle) => vehicle.id));
  }

  protected tenantIdFromRequest(req: FleetRequestContext): string {
    const tenantId = req.user?.tenantId?.trim();
    if (!tenantId) {
      throw new UnauthorizedException("Tenant context is missing from the access token");
    }
    return tenantId;
  }

  protected async recordActivity(
    req: FleetRequestContext,
    activity: {
      entityType: AuditEntityType;
      entityId: string;
      action: string;
      summary: string;
      metadata?: Record<string, unknown>;
      service?: string;
      occurredAt?: string;
    },
  ): Promise<void> {
    try {
      const tenantId = this.tenantIdFromRequest(req);
      const actorId = req.user?.userId ?? "system";
      const actorRole = req.user?.role ?? "system";
      const occurredAt = activity.occurredAt ?? new Date().toISOString();
      const ipAddress = this.clientIp(req);
      const metadata = { ...(activity.metadata ?? {}), ...(ipAddress ? { ipAddress } : {}) };

      await this.auditLog.record({
        tenantId,
        entityType: activity.entityType,
        entityId: activity.entityId,
        action: activity.action,
        actorId,
        metadata,
        occurredAt,
      });

      await this.bus.publish(`tm.${tenantId}.activity.logged`, {
        id: randomUUID(),
        type: "activity.logged",
        version: 1,
        occurred_at: occurredAt,
        tenant_id: tenantId,
        actor: { id: actorId, role: actorRole },
        data: {
          service: activity.service ?? "fleet",
          action: activity.action,
          entity_type: activity.entityType,
          entity_id: activity.entityId,
          summary: activity.summary,
          metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `fleet_activity_log_failed:${activity.action}:${(error as Error).message}`,
      );
    }
  }

  private clientIp(req: FleetRequestContext): string | null {
    if (!this.appConfig || !req.headers) return null;
    const { trustedProxies, clientIpHeader } = this.appConfig.audit;
    return clientIpFrom({ headers: req.headers, socket: req.socket }, { trustedProxies, header: clientIpHeader });
  }

  protected parseOptionalBoolean(
    value: string | undefined,
    field: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    throw new BadRequestException(`${field} must be either "true" or "false"`);
  }

  protected async runFleetUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof VehicleNotFoundError
        || error instanceof DriverNotFoundError
        || error instanceof DeviceNotFoundError
        || error instanceof WaybillNotFoundError
        || error instanceof InvoiceNotFoundError
        || error instanceof PricingRuleNotFoundError
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof VehicleQuotaExceededError || error instanceof FleetQuotaExceededError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof VehicleCapacityError) {
        throw new BadRequestException({
          statusCode: 400,
          error: "Bad Request",
          message: error.message,
          field: error.field,
        });
      }
      throw error;
    }
  }
}
