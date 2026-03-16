import { Inject, Injectable } from "@nestjs/common";
import { ALERT_REPOSITORY, type AlertFilters, type AlertRepository } from "../domain/alert.repository";

@Injectable()
export class ListAlertsUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly repo: AlertRepository) {}

  async execute(tenantId: string, filters?: AlertFilters) {
    return this.repo.findAll(tenantId, filters);
  }
}
