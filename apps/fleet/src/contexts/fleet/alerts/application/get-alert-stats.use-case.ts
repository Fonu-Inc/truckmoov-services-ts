import { Inject, Injectable } from "@nestjs/common";
import type { Alert } from "../domain/alert.entity";
import { ALERT_REPOSITORY, type AlertRepository } from "../domain/alert.repository";

export type AlertStats = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  meanTimeToResolveMs: number | null;
};

@Injectable()
export class GetAlertStatsUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository) {}

  async execute(tenantId: string): Promise<AlertStats> {
    const alerts = await this.repo.findAll(tenantId);
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const resolveTimes: number[] = [];

    for (const alert of alerts) {
      byStatus[alert.status] = (byStatus[alert.status] ?? 0) + 1;
      byType[alert.type] = (byType[alert.type] ?? 0) + 1;
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
      if (alert.resolvedAt) {
        resolveTimes.push(alert.resolvedAt.getTime() - alert.triggeredAt.getTime());
      }
    }

    return {
      total: alerts.length,
      byStatus,
      byType,
      bySeverity,
      meanTimeToResolveMs: resolveTimes.length
        ? resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length
        : null,
    };
  }
}
