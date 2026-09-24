import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import { OVERDUE_SOURCE_STATUSES } from '@auth/installation/domain/installation-order';
import { lagosToday } from '@shared/devices';
import { InstallerAssignmentService } from '../services/installer-assignment.service';

const BATCH_SIZE = 100;

/**
 * Gives waiting orders an installer, and marks jobs whose Lagos day has
 * passed as overdue. Every write is conditional on the status it read, so
 * several replicas sweeping at once cannot assign one order twice. The whole
 * queue is read page by page, so orders nobody can take never hide the rest.
 */
@Injectable()
export class SweepInstallationOrdersUseCase {
  private readonly logger = new Logger(SweepInstallationOrdersUseCase.name);

  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(InstallerAssignmentService) private readonly assignment: InstallerAssignmentService,
  ) {}

  async run(now: Date = new Date()): Promise<{ assigned: number; overdue: number }> {
    const assigned = await this.assignWaiting(now);
    const overdue = await this.orders.markOverdue(OVERDUE_SOURCE_STATUSES, lagosToday(now), now);
    if (assigned > 0 || overdue > 0) {
      this.logger.log(`installation_sweep:assigned=${assigned}:overdue=${overdue}`);
    }
    return { assigned, overdue };
  }

  private async assignWaiting(now: Date): Promise<number> {
    let page = await this.orders.findUnassigned(BATCH_SIZE);
    if (page.length === 0) return 0;

    const assign = await this.assignment.assigner();
    let assigned = 0;
    while (page.length > 0) {
      for (const order of page) if (await assign(order, now)) assigned += 1;
      page = page.length < BATCH_SIZE ? [] : await this.orders.findUnassigned(BATCH_SIZE, last(page));
    }
    return assigned;
  }
}

function last(page: StoredInstallationOrder[]): StoredInstallationOrder {
  return page[page.length - 1];
}
