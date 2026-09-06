import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  SHARE_LINK_REPOSITORY,
  type ShareLinkRepository,
} from "./contexts/fleet/tracking/domain/share-link.repository";

type JobStatusChangedEvent = {
  tenantId?: string;
  jobId?: string;
  newStatus?: string;
};

/** A job that has ended, whichever way it ended. */
const TERMINAL_JOB_STATUSES = ["delivered", "cancelled"];

/** Deleted this long after expiry, once nobody could still be looking at it. */
const REAP_AFTER_HOURS = 24;

const REAP_BATCH = 200;

/**
 * Ends a share link when the job it follows ends, and clears it out later.
 *
 * A customer's link is scoped to a delivery. Leaving it live after the truck
 * has moved on to somebody else's freight keeps showing them a vehicle they no
 * longer have any business watching, which is why revocation is driven by the
 * job rather than left to the expiry clock.
 */
@Injectable()
export class ShareLinkLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ShareLinkLifecycleService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(SHARE_LINK_REPOSITORY) private readonly links: ShareLinkRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe("tm.*.job.status.changed", async (event) => {
      const payload =
        (event as { data?: JobStatusChangedEvent })?.data ?? (event as JobStatusChangedEvent);
      await this.revokeIfJobEnded(payload);
    }, "share_link_lifecycle");

    // Hourly rather than on the tracking sweep's cadence: this is cleanup, and
    // an expired link is already refused whether or not the row is still there.
    this.timer = setInterval(() => void this.reap(), 60 * 60 * 1000);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async revokeIfJobEnded(payload: JobStatusChangedEvent): Promise<number> {
    const jobId = payload?.jobId?.trim();
    const status = payload?.newStatus?.trim().toLowerCase();
    if (!jobId || !status || !TERMINAL_JOB_STATUSES.includes(status)) return 0;

    try {
      const revoked = await this.links.revokeForJob(jobId, new Date());
      if (revoked > 0) this.logger.log(`share_links_revoked:${jobId}:${revoked}`);
      return revoked;
    } catch (error) {
      this.logger.warn(
        `share_link_revoke_failed:${jobId}:${error instanceof Error ? error.message : "unknown"}`,
      );
      return 0;
    }
  }

  /**
   * Deletes links whose window closed a day ago.
   *
   * A job that is never marked delivered would otherwise leave its row behind
   * for good. Kept for a day past expiry so a customer who opens a stale link
   * still gets "no longer available" rather than a bare not-found.
   */
  async reap(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - REAP_AFTER_HOURS * 60 * 60 * 1000);

    try {
      const expired = await this.links.findExpired(cutoff, REAP_BATCH);
      for (const link of expired) await this.links.deleteById(link.id);
      if (expired.length > 0) this.logger.log(`share_links_reaped:${expired.length}`);
      return expired.length;
    } catch (error) {
      this.logger.warn(
        `share_link_reap_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      return 0;
    }
  }
}
