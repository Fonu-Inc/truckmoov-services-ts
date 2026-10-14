import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BEHAVIOR_EVENT_REPOSITORY,
  BEHAVIOR_EVENT_TYPES,
  BEHAVIOR_SEVERITIES,
  BEHAVIOR_WINDOW_DAYS,
  rankDrivers,
  scoreBehaviorEvents,
  scoreDrivers,
  type BehaviorEventRepository,
  type BehaviorScores,
  type StoredBehaviorEvent,
} from "../../domain/driver-behavior";
import {
  GEOFENCE_ALERT_READ_REPOSITORY,
  type GeofenceAlertReadRepository,
} from "../../domain/geofence-alert-read.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";
import { ALERT_REPOSITORY, type AlertRepository } from "../../../alerts/domain/alert.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const GEOFENCE_ALERT_TYPES = ["geofence_entry", "geofence_exit", "geofence_dwell", "geofence_speeding"];

@Injectable()
export class DriverBehaviorUseCase {
  constructor(
    @Inject(BEHAVIOR_EVENT_REPOSITORY) private readonly events: BehaviorEventRepository,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepository,
    @Inject(GEOFENCE_ALERT_READ_REPOSITORY) private readonly reads: GeofenceAlertReadRepository,
  ) {}

  async summary(
    tenantId: string,
    periodDays: number,
    userId: string,
    ownedDriverIds: Set<string> | null = null,
    ownedVehicleIds: Set<string> | null = null,
  ) {
    const since = new Date(Date.now() - periodDays * DAY_MS);
    const last24h = new Date(Date.now() - DAY_MS);

    const [events, drivers, alerts, readIds] = await Promise.all([
      this.scoringEvents(tenantId, since),
      this.drivers.findAll({ tenantId }),
      this.alerts.findAll(tenantId),
      this.reads.findReadAlertIds(tenantId, userId),
    ]);

    const scopedDrivers = drivers.filter(
      (driver) => ownedDriverIds === null || ownedDriverIds.has(driver.id),
    );
    const scopedEvents = events.filter(
      (event) => ownedDriverIds === null || ownedDriverIds.has(event.driverId),
    );

    const ranking = rankDrivers(
      scopedDrivers.map((driver) => ({ id: driver.id, name: driver.name })),
      scopedEvents,
    );
    const scored = ranking
      .map((entry) => entry.scores.overall)
      .filter((score): score is number => score !== null);
    const geofence = this.geofenceAlerts(alerts, since, readIds, ownedVehicleIds);

    return {
      // Averaging over drivers with no events would report a fleet of new
      // drivers as flawless. Only scored drivers count toward the average.
      averageScore:
        scored.length > 0
          ? Math.round(scored.reduce((total, score) => total + score, 0) / scored.length)
          : null,
      eventsLast24h: scopedEvents.filter((event) => event.occurredAt >= last24h).length,
      criticalLast24h: scopedEvents.filter(
        (event) => event.occurredAt >= last24h && event.severity === "critical",
      ).length,
      driversScored: scored.length,
      driversTotal: scopedDrivers.length,
      zoneEntries: geofence.items.filter((alert) => alert.direction === "entry").length,
      zoneExits: geofence.items.filter((alert) => alert.direction === "exit").length,
      unreadGeofenceAlerts: geofence.unread,
      periodDays,
    };
  }

  async ranking(tenantId: string, periodDays: number, ownedDriverIds: Set<string> | null = null) {
    const since = new Date(Date.now() - periodDays * DAY_MS);
    const [events, drivers] = await Promise.all([
      this.scoringEvents(tenantId, since),
      this.drivers.findAll({ tenantId }),
    ]);

    return {
      periodDays,
      weights: { braking: 30, speeding: 30, acceleration: 20, cornering: 20 },
      items: rankDrivers(
        drivers
          .filter((driver) => ownedDriverIds === null || ownedDriverIds.has(driver.id))
          .map((driver) => ({ id: driver.id, name: driver.name })),
        events.filter((event) => ownedDriverIds === null || ownedDriverIds.has(event.driverId)),
      ),
    };
  }

  async listEvents(
    tenantId: string,
    filters: { periodDays: number; severity?: string; driverId?: string; limit?: number },
    ownedDriverIds: Set<string> | null = null,
  ) {
    const since = new Date(Date.now() - filters.periodDays * DAY_MS);
    const found = await this.events.findAll(tenantId, {
      since,
      driverId: filters.driverId,
      severity: filters.severity as StoredBehaviorEvent["severity"] | undefined,
      limit: filters.limit ?? 100,
    });
    const events = found.filter(
      (event) => ownedDriverIds === null || ownedDriverIds.has(event.driverId),
    );

    return {
      total: events.length,
      criticalCount: events.filter((event) => event.severity === "critical").length,
      items: events.map((event) => ({
        id: event.id,
        driverId: event.driverId,
        vehicleId: event.vehicleId,
        type: event.type,
        severity: event.severity,
        speedKph: event.speedKph,
        latitude: event.latitude,
        longitude: event.longitude,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }

  async driverBehavior(tenantId: string, driverId: string, periodDays: number) {
    const since = new Date(Date.now() - periodDays * DAY_MS);
    const events = await this.scoringEvents(tenantId, since, driverId);

    return {
      periodDays,
      eventsRecorded: events.length,
      scores: scoreBehaviorEvents(events),
      recentEvents: events.slice(0, 20).map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        speedKph: event.speedKph,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }

  /** Behaviour scores for the roster and the driver record, over the same window as the detail page. */
  async scoresForDrivers(tenantId: string, driverIds: string[]): Promise<Map<string, BehaviorScores>> {
    if (driverIds.length === 0) return new Map();
    const since = new Date(Date.now() - BEHAVIOR_WINDOW_DAYS * DAY_MS);
    const driverId = driverIds.length === 1 ? driverIds[0] : undefined;
    return scoreDrivers(driverIds, await this.scoringEvents(tenantId, since, driverId));
  }

  async geofenceAlertFeed(
    tenantId: string,
    periodDays: number,
    userId: string,
    ownedVehicleIds: Set<string> | null = null,
  ) {
    const since = new Date(Date.now() - periodDays * DAY_MS);
    const [alerts, readIds] = await Promise.all([
      this.alerts.findAll(tenantId),
      this.reads.findReadAlertIds(tenantId, userId),
    ]);
    return this.geofenceAlerts(alerts, since, readIds, ownedVehicleIds);
  }

  async markGeofenceAlertsRead(
    tenantId: string,
    userId: string,
    alertIds: string[],
    ownedVehicleIds: Set<string> | null = null,
  ) {
    if (alertIds.length === 0) {
      throw new BadRequestException("Provide at least one alert id");
    }

    // Only alerts the caller can actually see are marked. Without this the
    // endpoint accepts any id, writing read rows against alerts in other
    // tenants and letting a caller probe which ids exist.
    const alerts = await this.alerts.findAll(tenantId);
    const visible = new Set(
      alerts
        .filter(
          (alert) =>
            GEOFENCE_ALERT_TYPES.includes(alert.type) &&
            (ownedVehicleIds === null ||
              (alert.vehicleId !== null && ownedVehicleIds.has(alert.vehicleId))),
        )
        .map((alert) => alert.id),
    );
    const permitted = alertIds.filter((alertId) => visible.has(alertId));

    const now = new Date();
    await this.reads.markRead(
      permitted.map((alertId) => ({
        id: randomUUID(),
        tenantId,
        alertId,
        readBy: userId,
        readAt: now,
      })),
    );
    return { markedRead: permitted.length, ignored: alertIds.length - permitted.length };
  }

  /** Ingest point for telemetry-derived events. */
  async recordEvent(
    tenantId: string,
    input: {
      driverId: string;
      vehicleId?: string | null;
      type: string;
      severity: string;
      speedKph?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      occurredAt?: string;
    },
  ) {
    if (!(BEHAVIOR_EVENT_TYPES as readonly string[]).includes(input.type)) {
      throw new BadRequestException(`type must be one of: ${BEHAVIOR_EVENT_TYPES.join(", ")}`);
    }
    if (!(BEHAVIOR_SEVERITIES as readonly string[]).includes(input.severity)) {
      throw new BadRequestException(`severity must be one of: ${BEHAVIOR_SEVERITIES.join(", ")}`);
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("occurredAt must be a valid timestamp");
    }

    const event: StoredBehaviorEvent = {
      id: randomUUID(),
      tenantId,
      driverId: input.driverId,
      vehicleId: input.vehicleId ?? null,
      type: input.type as StoredBehaviorEvent["type"],
      severity: input.severity as StoredBehaviorEvent["severity"],
      speedKph: input.speedKph ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      occurredAt,
      createdAt: new Date(),
    };
    await this.events.save(event);
    return { id: event.id, occurredAt: event.occurredAt.toISOString() };
  }

  /**
   * Removes an event recorded by mistake. An event on a driver outside the
   * caller's scope reads as missing, the same as one in another tenant.
   */
  async deleteEvent(
    tenantId: string,
    eventId: string,
    ownedDriverIds: Set<string> | null = null,
  ): Promise<StoredBehaviorEvent> {
    const event = await this.events.findById(tenantId, eventId);
    if (!event || (ownedDriverIds !== null && !ownedDriverIds.has(event.driverId))) {
      throw new NotFoundException("Behaviour event not found");
    }
    await this.events.delete(tenantId, eventId);
    return event;
  }

  private scoringEvents(tenantId: string, since: Date, driverId?: string) {
    return this.events.findAll(tenantId, { since, driverId, limit: null });
  }

  private geofenceAlerts(
    alerts: Awaited<ReturnType<AlertRepository["findAll"]>>,
    since: Date,
    readIds: string[],
    ownedVehicleIds: Set<string> | null = null,
  ) {
    const read = new Set(readIds);
    const items = alerts
      .filter(
        (alert) =>
          GEOFENCE_ALERT_TYPES.includes(alert.type) &&
          alert.triggeredAt >= since &&
          (ownedVehicleIds === null ||
            (alert.vehicleId !== null && ownedVehicleIds.has(alert.vehicleId))),
      )
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime())
      .map((alert) => ({
        id: alert.id,
        type: alert.type,
        direction: alert.type.replace("geofence_", ""),
        severity: alert.severity,
        vehicleId: alert.vehicleId,
        details: alert.details,
        triggeredAt: alert.triggeredAt.toISOString(),
        read: read.has(alert.id),
      }));

    return { total: items.length, unread: items.filter((item) => !item.read).length, items };
  }
}
