import { BadRequestException, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role } from "@shared/rbac";
import { randomUUID } from "node:crypto";
import { AuditLogService, type AuditEntityType } from "./audit-log.service";
import { DeviceNotFoundError } from "./contexts/fleet/devices";
import { WaybillNotFoundError } from "./contexts/fleet/waybills/domain/errors/waybill.errors";
import { DriverNotFoundError } from "./contexts/fleet/drivers";
import { VehicleNotFoundError } from "./contexts/fleet/vehicles";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";

export type FleetRequestContext = {
  user?: { tenantId?: string; userId?: string; role?: string; email?: string };
  ip?: string;
};

export abstract class BaseFleetController {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
  ) {}

  /**
   * The owner operator the caller is, when they are one. Tenant is the outer
   * boundary; this is the inner one, because an owner operator can hold a seat
   * inside an enterprise or aggregator tenant and must not see the rest of it.
   */
  protected ownerOperatorIdFromRequest(req: FleetRequestContext): string | undefined {
    if (req.user?.role !== Role.OWNER_OPERATOR) return undefined;
    return req.user?.userId ?? "__no_owner_operator__";
  }

  /**
   * The vehicles an owner operator may see. Null means the caller sees the
   * whole tenant. Vehicle ids are the scoping key for anything hung off a
   * vehicle — positions, geofence alerts, devices — so the lookup lives here
   * rather than being repeated per controller.
   */
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
      const metadata = { ...(activity.metadata ?? {}) };

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
      ) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
