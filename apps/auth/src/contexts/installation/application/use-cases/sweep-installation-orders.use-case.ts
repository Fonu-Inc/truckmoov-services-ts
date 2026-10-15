import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import { OVERDUE_SOURCE_STATUSES, REMINDER_STATUSES } from '@auth/installation/domain/installation-order';
import { lagosToday, nextCalendarDay } from '@shared/devices';
import { InstallerAssignmentService, rejectersByOrder } from '../services/installer-assignment.service';
import { InstallerNotifier, assignedNotice } from '../services/installer-notifier.service';

const BATCH_SIZE = 100;

/**
 * Gives waiting orders an installer, marks jobs whose Lagos day has passed as
 * overdue, and reminds installers of tomorrow's jobs once. Every write is conditional on the status it read, so
 * several replicas sweeping at once cannot assign one order twice. The whole
 * queue is read page by page, so orders nobody can take never hide the rest.
 * An order is never offered again to an installer who rejected it.
 */
@Injectable()
export class SweepInstallationOrdersUseCase {
  private readonly logger = new Logger(SweepInstallationOrdersUseCase.name);

  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(InstallerAssignmentService) private readonly assignment: InstallerAssignmentService,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  async run(now: Date = new Date()): Promise<{ assigned: number; overdue: number; reminded: number }> {
    const assigned = await this.assignWaiting(now);
    const overdue = await this.orders.markOverdue(OVERDUE_SOURCE_STATUSES, lagosToday(now), now);
    const reminded = await this.remind(now);
    if (assigned > 0 || overdue > 0 || reminded > 0) {
      this.logger.log(`installation_sweep:assigned=${assigned}:overdue=${overdue}:reminded=${reminded}`);
    }
    return { assigned, overdue, reminded };
  }

  /** The stamp is written before the notice, so replicas sweeping together remind once. */
  private async remind(now: Date): Promise<number> {
    const due = await this.orders.claimReminders(REMINDER_STATUSES, nextCalendarDay(lagosToday(now)), now);
    for (const order of due) {
      await this.notifier.notify({ type: 'job_reminder', order, stamp: (order.reminderSentAt ?? now).toISOString() }, now);
    }
    return due.length;
  }

  private async assignWaiting(now: Date): Promise<number> {
    let page = await this.orders.findUnassigned(BATCH_SIZE);
    if (page.length === 0) return 0;

    const assign = await this.assignment.assigner();
    const today = lagosToday(now);
    let assigned = 0;
    while (page.length > 0) {
      const rejecters = rejectersByOrder(await this.orders.findOfferRejections(page.map((order) => order.id)));
      for (const order of page) {
        if (order.scheduledDate < today) continue;
        const assignment = await assign(order, now, rejecters.get(order.id));
        if (!assignment) continue;
        assigned += 1;
        await this.notifier.notify(assignedNotice(assignment.order, now), now);
      }
      page = page.length < BATCH_SIZE ? [] : await this.orders.findUnassigned(BATCH_SIZE, last(page));
    }
    return assigned;
  }
}

function last(page: StoredInstallationOrder[]): StoredInstallationOrder {
  return page[page.length - 1];
}
