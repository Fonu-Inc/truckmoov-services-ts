import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { ALERT_REPOSITORY, type AlertRepository } from "./contexts/fleet/alerts/domain/alert.repository";

const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_BATCH = 500;

/**
 * Escalates open alerts nobody acknowledged in time. The scan is across every
 * tenant: an alert belongs to whichever company raised it, not to a default one.
 */
@Injectable()
export class AlertEscalationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AlertEscalationService.name);
  private readonly thresholdMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.thresholdMs = config.fleet.alertEscalationMinutes * 60 * 1000;
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.escalateStale().catch((error) => this.logFailure(error)), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async escalateStale(now = new Date()): Promise<number> {
    const stale = await this.repo.findOpenTriggeredBefore(new Date(now.getTime() - this.thresholdMs), SWEEP_BATCH);
    for (const alert of stale) {
      await this.repo.save(alert.escalate(now));
      this.logger.warn(`Alert ${alert.id} escalated (tenant=${alert.tenantId} type=${alert.type})`);
    }
    return stale.length;
  }

  private logFailure(error: unknown): void {
    this.logger.warn(`alert_escalation_failed:${error instanceof Error ? error.message : "unknown"}`);
  }
}
