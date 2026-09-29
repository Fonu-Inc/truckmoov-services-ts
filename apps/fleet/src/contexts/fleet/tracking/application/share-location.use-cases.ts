import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import {
  DISPATCH_JOBS_READER,
  type DispatchJob,
  type DispatchJobsReader,
} from "../../dispatch/domain/ports/dispatch-jobs-reader.port";
import {
  VEHICLE_POSITIONS_READER,
  type VehiclePositionsReader,
} from "../../reports/domain/ports/vehicle-positions-reader.port";
import { VEHICLE_REPOSITORY, type VehicleRepository } from "../../vehicles/domain/repositories/vehicle.repository";
import {
  SHARE_LINK_REPOSITORY,
  type ShareLinkRepository,
} from "../domain/share-link.repository";
import { hashShareToken, mintShareToken, shareLinkIsLive } from "../domain/share-token";
import { activeJobByVehicle } from "../domain/active-jobs";

/**
 * A job with no deadline still has to expire. Long enough to outlast a
 * cross-country run, short enough that a forgotten link is not permanent.
 */
const FALLBACK_LINK_HOURS = 24;

export class ShareLinkExpiredError extends Error {
  constructor() {
    super("This tracking link has expired");
  }
}

@Injectable()
export class ShareVehicleLocationUseCase {
  constructor(
    @Inject(SHARE_LINK_REPOSITORY) private readonly links: ShareLinkRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(input: { tenantId: string; vehicleId: string; createdBy: string }) {
    const vehicle = await this.vehicles.findById(input.vehicleId, input.tenantId);
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const jobs = await this.dispatchJobs.listJobs(input.tenantId).catch(() => [] as DispatchJob[]);
    const job = activeJobByVehicle(jobs).get(input.vehicleId) ?? null;

    // One live link per vehicle. Minting a second would leave the first
    // working, and nobody can revoke a link they were never shown again.
    const existing = await this.links.findActiveForVehicle(input.tenantId, input.vehicleId);
    if (existing) {
      return {
        url: null,
        alreadyShared: true,
        expiresAt: existing.expiresAt.toISOString(),
        jobReference: job?.reference ?? null,
      };
    }

    const { token, tokenHash } = mintShareToken();
    const expiresAt = this.expiryFor(job);

    await this.links.save({
      id: randomUUID(),
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      jobId: job?.id ?? null,
      tokenHash,
      createdBy: input.createdBy,
      createdAt: new Date(),
      expiresAt,
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
    });

    return {
      // The only time the token is ever readable. It is not stored in the
      // clear, so it cannot be shown again.
      url: `${this.config.app.tenantAppUrl.replace(/\/$/, "")}/track/${token}`,
      alreadyShared: false,
      expiresAt: expiresAt.toISOString(),
      jobReference: job?.reference ?? null,
    };
  }

  private expiryFor(job: DispatchJob | null, now: Date = new Date()): Date {
    const fallback = new Date(now.getTime() + FALLBACK_LINK_HOURS * 60 * 60 * 1000);
    const deadline = job?.deadline ? Date.parse(job.deadline) : Number.NaN;
    if (Number.isNaN(deadline)) return fallback;

    // A little past the deadline: a late delivery is exactly when a customer
    // is watching the link.
    const graceEnds = new Date(deadline + 2 * 60 * 60 * 1000);
    // A job already past its grace has no window left. A link minted expired
    // was never live, so it could never be shown again and every click would
    // mint another dead one; a late job gets the same lifetime as an undated one.
    return graceEnds.getTime() > now.getTime() ? graceEnds : fallback;
  }
}

/**
 * What someone holding a link is shown.
 *
 * Position and progress only. No driver name, no plate, no other vehicle and
 * no tenant identifier: the recipient is a customer waiting on a delivery, not
 * a user of the platform.
 */
@Injectable()
export class ViewSharedLocationUseCase {
  constructor(
    @Inject(SHARE_LINK_REPOSITORY) private readonly links: ShareLinkRepository,
    @Inject(VEHICLE_POSITIONS_READER) private readonly positions: VehiclePositionsReader,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
  ) {}

  async execute(token: string) {
    const link = await this.links.findByTokenHash(hashShareToken(token));
    // A revoked or expired link is reported the same way as one that never
    // existed, so a probe cannot tell a real token from a wrong one.
    if (!link || !shareLinkIsLive(link)) throw new ShareLinkExpiredError();

    const [positions, jobs] = await Promise.all([
      this.positions.listLatestPositions(link.tenantId).catch(() => []),
      this.dispatchJobs.listJobs(link.tenantId).catch(() => [] as DispatchJob[]),
    ]);

    const position = positions.find((entry) => entry.vehicleId === link.vehicleId) ?? null;
    const job = link.jobId ? jobs.find((entry) => entry.id === link.jobId) ?? null : null;

    await this.links.recordView(link.id, new Date());

    return {
      position: position
        ? {
            lat: position.latitude,
            lng: position.longitude,
            speedKph: position.speedKph,
            fixedAt: position.recordedAt,
          }
        : null,
      job: job
        ? {
            reference: job.reference,
            status: job.status,
            pickupAddress: job.pickupAddress,
            dropoffAddress: job.dropoffAddress,
            deadline: job.deadline,
          }
        : null,
      expiresAt: link.expiresAt.toISOString(),
    };
  }
}
