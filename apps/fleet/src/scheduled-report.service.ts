import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { DashboardUseCase } from "./contexts/fleet/reports";

@Injectable()
export class ScheduledReportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledReportService.name);
  private readonly intervalMs: number;
  private readonly tenantId: string;

  constructor(
    private readonly dashboard: DashboardUseCase,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.intervalMs = config.fleet.reportIntervalHours * 3_600_000;
    this.tenantId = config.fleet.defaultTenant;
  }

  onApplicationBootstrap() {
    setInterval(() => this.run(), this.intervalMs);
  }

  async run() {
    try {
      const snapshot = await this.dashboard.execute(this.tenantId);
      await this.bus.publish(`tm.${this.tenantId}.report.daily`, {
        id: crypto.randomUUID(),
        type: "report.daily",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: this.tenantId,
        data: snapshot as unknown as Record<string, unknown>,
      });
      this.logger.log("Daily report emitted");
    } catch (err) {
      this.logger.error("Scheduled report failed", (err as Error).message);
    }
  }
}
