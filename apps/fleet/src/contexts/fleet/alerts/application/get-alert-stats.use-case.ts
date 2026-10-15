import { Inject, Injectable } from "@nestjs/common";
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
    const [counts, meanTimeToResolveMs] = await Promise.all([
      this.repo.countBy(tenantId),
      this.repo.meanTimeToResolveMs(tenantId),
    ]);
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let total = 0;

    for (const { status, type, severity, count } of counts) {
      byStatus[status] = (byStatus[status] ?? 0) + count;
      byType[type] = (byType[type] ?? 0) + count;
      bySeverity[severity] = (bySeverity[severity] ?? 0) + count;
      total += count;
    }

    return { total, byStatus, byType, bySeverity, meanTimeToResolveMs };
  }
}
