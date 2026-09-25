import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import { rejectionReason, unassignOrder } from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';
import { InstallationJobConflictError } from '@auth/installation/domain/installation-job.errors';
import { InstallerAssignmentService } from '../services/installer-assignment.service';
import { InstallerNotifier, assignedNotice } from '../services/installer-notifier.service';
import { installerJob } from './support/current-installer';
import { JOB_CHANGED_MESSAGE } from './support/job-transition';

/**
 * An installer turns down an offer with a reason. The job goes back to the
 * queue and is offered at once to the next installer, never to anyone who
 * rejected it; if nobody fits, the sweep keeps trying.
 */
@Injectable()
export class RejectJobOfferUseCase {
  private readonly logger = new Logger(RejectJobOfferUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(InstallerAssignmentService) private readonly assignment: InstallerAssignmentService,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  async execute(accessToken: string, jobId: string, reason: unknown, now: Date = new Date()) {
    const text = rejectionReason(reason);
    const { installer, order } = await installerJob(
      { tokens: this.tokens, installers: this.installers, orders: this.orders },
      accessToken,
      jobId,
    );
    if (order.status !== 'assigned') {
      throw new InstallationJobConflictError(`A job that is ${order.status} cannot be rejected`);
    }
    const released = unassignOrder(order, now);
    const rejection = { orderId: order.id, installerId: installer.id, reason: text, rejectedAt: now };
    if (!(await this.orders.rejectOffer(released, rejection))) {
      throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
    }
    await this.offerAgain(released, now);
    return { id: order.id, jobNumber: order.orderNumber, rejectedAt: now.toISOString() };
  }

  private async offerAgain(order: StoredInstallationOrder, now: Date): Promise<void> {
    const rejecters = await this.orders.findOfferRejections([order.id]);
    const assign = await this.assignment.assigner();
    const next = await assign(order, now, new Set(rejecters.map((r) => r.installerId)));
    this.logger.log(`installation_offer_rejected:${order.orderNumber}:next=${next?.installer.id ?? 'unassigned'}`);
    if (next) await this.notifier.notify(assignedNotice(next.order, now), now);
  }
}
