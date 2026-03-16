import { Inject, Injectable } from "@nestjs/common";
import { AlertNotFoundError } from "../domain/alert-not-found.error";
import { ALERT_REPOSITORY, type AlertRepository } from "../domain/alert.repository";

@Injectable()
export class ResolveAlertUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository) {}

  async execute(tenantId: string, alertId: string, by: string) {
    const alert = await this.repo.findById(tenantId, alertId);
    if (!alert) throw new AlertNotFoundError(alertId);
    const updated = alert.resolve(by);
    await this.repo.save(updated);
    return updated;
  }
}
