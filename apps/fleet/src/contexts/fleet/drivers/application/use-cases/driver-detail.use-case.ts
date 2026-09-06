import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BEHAVIOR_EVENT_REPOSITORY,
  scoreBehaviorEvents,
  type BehaviorEventRepository,
} from "../../domain/driver-behavior";
import {
  FATIGUE_ANALYSIS_REPOSITORY,
  type FatigueAnalysisRepository,
} from "../../domain/driver-fatigue";
import {
  DRIVER_CONSENT_REPOSITORY,
  canSendOn,
  type ConsentChannel,
  type DriverConsentRepository,
} from "../../domain/driver-consent.repository";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../domain/repositories/driver.repository";
import {
  DISPATCH_JOBS_READER,
  type DispatchJobsReader,
} from "../../../dispatch/domain/ports/dispatch-jobs-reader.port";
import { ALERT_REPOSITORY, type AlertRepository } from "../../../alerts/domain/alert.repository";

const BEHAVIOR_WINDOW_DAYS = 30;
const TRIP_HISTORY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DriverDetailUseCase {
  constructor(
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(BEHAVIOR_EVENT_REPOSITORY) private readonly events: BehaviorEventRepository,
    @Inject(FATIGUE_ANALYSIS_REPOSITORY) private readonly fatigue: FatigueAnalysisRepository,
    @Inject(DRIVER_CONSENT_REPOSITORY) private readonly consents: DriverConsentRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepository,
  ) {}

  async execute(tenantId: string, driverId: string) {
    const driver = await this.drivers.findById(driverId, tenantId);
    if (!driver) throw new NotFoundException("Driver not found");

    const since = new Date(Date.now() - BEHAVIOR_WINDOW_DAYS * DAY_MS);
    const [events, latestFatigue, consents, jobs, alerts] = await Promise.all([
      this.events.findAll(tenantId, { driverId, since }),
      this.fatigue.findLatestForDriver(tenantId, driverId),
      this.consents.findAllForDriver(tenantId, driverId),
      this.dispatchJobs.listJobs(tenantId),
      this.alerts.findAll(tenantId),
    ]);

    const scores = scoreBehaviorEvents(events);
    const driverJobs = jobs.filter((job) => job.assignedDriverId === driverId);
    const driverAlerts = alerts.filter((alert) => alert.status === "open" || alert.status === "escalated");

    return {
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone ?? null,
        email: driver.email ?? null,
        status: driver.status,
        preferredChannel: driver.communicationPreference,
        totalTrips: driverJobs.length,
      },
      header: {
        behaviorScore: events.length > 0 ? scores.overall : null,
        fatigueScore: latestFatigue?.score ?? null,
        openAlerts: driverAlerts.length,
      },
      // The score is shown with its inputs rather than as a bare number: an
      // operator asked to act on a score needs to see what produced it.
      scoreBreakdown: {
        overall: events.length > 0 ? scores.overall : null,
        eventsRecorded: events.length,
        windowDays: BEHAVIOR_WINDOW_DAYS,
        dimensions: [
          { key: "braking", label: "Braking", weightPercent: 30, score: scores.braking, events: scores.counts.hardBrake },
          { key: "speed", label: "Speed control", weightPercent: 30, score: scores.speed, events: scores.counts.speeding },
          { key: "acceleration", label: "Acceleration", weightPercent: 20, score: scores.acceleration, events: scores.counts.hardAccel },
          { key: "cornering", label: "Cornering", weightPercent: 20, score: scores.cornering, events: scores.counts.sharpTurn },
        ],
      },
      contact: {
        phone: driver.phone ?? null,
        email: driver.email ?? null,
        preferredChannel: driver.communicationPreference,
        consent: {
          whatsapp: presentConsent(consents, "whatsapp"),
          sms: presentConsent(consents, "sms"),
        },
      },
      license: buildLicense(driver.licenseNumber, driver.licenseExpiryDate ?? null),
      safety: {
        behaviorScore: events.length > 0 ? scores.overall : null,
        criticalEvents: scores.counts.critical,
        fatigueScore: latestFatigue?.score ?? null,
        fatigueRisk: latestFatigue?.riskLevel ?? null,
        fatigueDataQuality: latestFatigue?.dataQuality ?? null,
      },
      trips: driverJobs
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, TRIP_HISTORY_LIMIT)
        .map((job) => ({
          jobId: job.id,
          reference: job.reference,
          status: job.status,
          pickupAddress: job.pickupAddress,
          dropoffAddress: job.dropoffAddress,
          amountNgn: job.amountNgn,
          completedAt: job.punctuality?.completedAt ?? null,
          onTime: job.punctuality?.onTime ?? null,
          createdAt: job.createdAt,
        })),
    };
  }
}

function presentConsent(
  consents: Array<{ channel: string; state: string; requestedAt: Date | null; respondedAt: Date | null }>,
  channel: ConsentChannel,
) {
  const consent = consents.find((entry) => entry.channel === channel);
  const state = (consent?.state ?? "unknown") as Parameters<typeof canSendOn>[1];
  return {
    channel,
    state,
    canSend: canSendOn(channel, state),
    requestedAt: consent?.requestedAt?.toISOString() ?? null,
    respondedAt: consent?.respondedAt?.toISOString() ?? null,
  };
}

/**
 * Days until expiry is negative once a licence has lapsed, which is what the
 * screen shows. A licence with no recorded expiry is unknown, not valid.
 */
export function buildLicense(licenseNumber: string, expiryDate: string | null) {
  if (!expiryDate) {
    return { licenseNumber, expiryDate: null, daysUntilExpiry: null, state: "unknown" as const };
  }

  const expiry = Date.parse(expiryDate);
  if (!Number.isFinite(expiry)) {
    return { licenseNumber, expiryDate, daysUntilExpiry: null, state: "unknown" as const };
  }

  const daysUntilExpiry = Math.ceil((expiry - Date.now()) / DAY_MS);
  const state = daysUntilExpiry < 0 ? "expired" : daysUntilExpiry <= 30 ? "expiring" : "valid";
  return { licenseNumber, expiryDate, daysUntilExpiry, state };
}
