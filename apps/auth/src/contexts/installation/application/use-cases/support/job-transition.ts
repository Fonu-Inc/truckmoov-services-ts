import { transitionOrder, type InstallationOrderStatus } from '@auth/installation/domain/installation-order';
import { InstallationJobConflictError } from '@auth/installation/domain/installation-job.errors';
import type {
  InstallationOrderRepository,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';

export const JOB_CHANGED_MESSAGE = 'This job changed while the request was in flight. Reload it and try again.';

/**
 * The job in its next status, checked against the transition map and written
 * only if nobody moved it since it was read.
 */
export async function moveJob(
  orders: InstallationOrderRepository,
  order: StoredInstallationOrder,
  next: InstallationOrderStatus,
  now: Date,
): Promise<StoredInstallationOrder> {
  const moved = transitionOrder(order, next, now);
  if (!(await orders.transition(moved, order.status))) {
    throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
  }
  return moved;
}
