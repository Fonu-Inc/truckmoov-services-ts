import { Injectable, Logger, OnApplicationBootstrap, Inject } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { ALERT_REPOSITORY, type AlertRepository } from "./contexts/fleet/alerts/domain/alert.repository";

@Injectable()
export class AlertEscalationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertEscalationService.name);
  private readonly thresholdMs: number;

  constructor(
    @Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.thresholdMs = config.fleet.alertEscalationMinutes * 60 * 1000;
  }

  onApplicationBootstrap() {
    setInterval(() => this.escalateStale(), 60_000);
  }

  private async escalateStale() {
    // In-memory repo has no tenant scan — iterate known data via a wildcard tenant approach.
    // For now we use the default tenant from config; multi-tenant can be extended later.
    const allAlerts = await this.repo.findAll("default");
    const now = Date.now();

    for (const alert of allAlerts) {
      if (alert.status !== "open") continue;
      if (now - alert.triggeredAt.getTime() < this.thresholdMs) continue;
      const escalated = alert.escalate();
      await this.repo.save(escalated);
      this.logger.warn(`Alert ${alert.id} escalated (type=${alert.type})`);
    }
  }
}
