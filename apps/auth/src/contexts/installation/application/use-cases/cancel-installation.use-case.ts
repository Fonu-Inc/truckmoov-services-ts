import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { resolveActorUser } from '@auth/session/application/use-cases/support/resolve-actor-user';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import type { InstallationOrderStatus } from '@auth/installation/domain/installation-order';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation/domain/installation-order.repository';
import { ActivityLogService } from '../../../../activity-log.service';
import { InstallerNotifier } from '../services/installer-notifier.service';
import { NoInstallationOrderError } from './confirm-installation.use-case';
import { moveJob } from './support/job-transition';

const CANCEL_ROLES = new Set<string>([Role.OWNER_OPERATOR, Role.ENTERPRISE_ADMIN]);
const NOT_CANCELLABLE: readonly InstallationOrderStatus[] = ['in_progress', 'completed'];
export const MAX_CANCEL_REASON_LENGTH = 1000;

export class InstallationNotCancellableError extends Error {
  constructor(status: InstallationOrderStatus) {
    super(`An installation that is ${status} cannot be cancelled`);
    this.name = 'InstallationNotCancellableError';
  }
}

function cancelReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const reason = String(value).trim();
  if (reason.length > MAX_CANCEL_REASON_LENGTH) {
    throw new OnboardingValidationError('reason', `reason must be ${MAX_CANCEL_REASON_LENGTH} characters or fewer`);
  }
  return reason || null;
}

/**
 * The customer calls off their own booking before the installer starts.
 * Only the order is cancelled: the onboarding stage and any payment are left
 * for the platform to settle, since stages only move forward and the refund
 * path covers mismatched payments only.
 */
@Injectable()
export class CancelInstallationUseCase {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  async execute(accessToken: string, reason?: unknown, now: Date = new Date()) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    if (!CANCEL_ROLES.has(actor.role)) {
      throw new ForbiddenError('You are not permitted to cancel this installation');
    }
    const note = cancelReason(reason);

    const order = await this.orders.findByTenantId(actor.tenantId);
    if (!order) throw new NoInstallationOrderError();
    const result = (status: InstallationOrderStatus, cancelledAt: Date | null) => ({
      status: true,
      message: 'Installation cancelled',
      data: { orderNumber: order.orderNumber, status, cancelledAt: cancelledAt?.toISOString() ?? null },
    });
    if (order.status === 'cancelled') return result(order.status, order.cancelledAt);
    if (NOT_CANCELLABLE.includes(order.status)) throw new InstallationNotCancellableError(order.status);

    const moved = await moveJob(this.orders, order, 'cancelled', now);
    await this.activity.record({
      tenantId: order.tenantId,
      service: 'auth',
      action: 'installation.cancelled',
      entityType: 'installation_order',
      entityId: order.id,
      summary: `${order.orderNumber} cancelled by the customer`,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      metadata: { reason: note, previousStatus: order.status },
    });
    await this.notifier.notify({ type: 'job_cancelled', order: moved, stamp: now.toISOString() }, now);
    return result(moved.status, moved.cancelledAt);
  }
}
