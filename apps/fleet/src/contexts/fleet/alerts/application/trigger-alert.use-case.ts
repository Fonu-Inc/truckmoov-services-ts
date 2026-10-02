import { Inject, Injectable } from "@nestjs/common";
import { Alert, type AlertSeverity } from "../domain/alert.entity";
import { ALERT_REPOSITORY, type AlertRepository } from "../domain/alert.repository";

export type TriggerAlertCommand = {
  id: string;
  tenantId: string;
  type: string;
  severity: AlertSeverity;
  vehicleId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
};

@Injectable()
export class TriggerAlertUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository) {}

  async execute(cmd: TriggerAlertCommand): Promise<Alert> {
    // A redelivered event must not reopen an alert someone already handled.
    const existing = await this.repo.findById(cmd.tenantId, cmd.id);
    if (existing) return existing;

    const alert = Alert.create({
      id: cmd.id,
      tenantId: cmd.tenantId,
      type: cmd.type,
      severity: cmd.severity,
      status: "open",
      vehicleId: cmd.vehicleId ?? null,
      jobId: cmd.jobId ?? null,
      details: cmd.details ?? {},
      triggeredAt: new Date(),
      acknowledgedAt: null,
      resolvedAt: null,
      escalatedAt: null,
      acknowledgedBy: null,
      resolvedBy: null,
    });
    await this.repo.save(alert);
    return alert;
  }
}
