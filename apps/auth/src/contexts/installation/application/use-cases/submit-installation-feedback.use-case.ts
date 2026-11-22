import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { resolveActorUser } from '@auth/session/application/use-cases/support/resolve-actor-user';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationFeedback,
} from '@auth/installation/domain/installation-order.repository';
import { ActivityLogService } from '../../../../activity-log.service';
import { InstallerNotifier } from '../services/installer-notifier.service';
import { NoInstallationOrderError } from './confirm-installation.use-case';
import { toFeedbackView } from './support/installation-job.views';

const FEEDBACK_ROLES = new Set<string>([Role.OWNER_OPERATOR, Role.ENTERPRISE_ADMIN]);
export const MAX_FEEDBACK_COMMENT_LENGTH = 1000;

export class InstallationNotCompletedError extends Error {
  constructor() {
    super('Feedback can be given once the installation is completed');
    this.name = 'InstallationNotCompletedError';
  }
}

export class FeedbackAlreadySubmittedError extends Error {
  constructor() {
    super('Feedback has already been given for this installation');
    this.name = 'FeedbackAlreadySubmittedError';
  }
}

function feedbackRating(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new OnboardingValidationError('rating', 'rating must be a whole number from 1 to 5');
  }
  return value;
}

function feedbackComment(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const comment = String(value).trim();
  if (comment.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    throw new OnboardingValidationError('comment', `comment must be ${MAX_FEEDBACK_COMMENT_LENGTH} characters or fewer`);
  }
  return comment || null;
}

/** The customer rates a completed installation, which closes the request and tells the installer. One per order. */
@Injectable()
export class SubmitInstallationFeedbackUseCase {
  constructor(
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  async execute(accessToken: string, input: { rating?: unknown; comment?: unknown }, now: Date = new Date()) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    if (!FEEDBACK_ROLES.has(actor.role)) {
      throw new ForbiddenError('You are not permitted to rate this installation');
    }
    const rating = feedbackRating(input?.rating);
    const comment = feedbackComment(input?.comment);

    const order = await this.orders.findByTenantId(actor.tenantId);
    if (!order) throw new NoInstallationOrderError();
    if (order.status !== 'completed') throw new InstallationNotCompletedError();

    const feedback: StoredInstallationFeedback = { orderId: order.id, rating, comment, submittedAt: now, submittedBy: actor.id };
    if (!(await this.orders.saveFeedback(feedback))) throw new FeedbackAlreadySubmittedError();

    await this.activity.record({
      tenantId: order.tenantId,
      service: 'auth',
      action: 'installation.feedback_submitted',
      entityType: 'installation_order',
      entityId: order.id,
      summary: `${order.orderNumber} rated ${rating}/5 by the customer`,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      metadata: { rating, comment },
    });
    const application = await this.applications.findById(order.applicationId);
    await this.notifier.notify(
      { type: 'job_closed', order, stamp: now.toISOString(), customer: application?.organizationName, rating },
      now,
    );
    return { status: true, message: 'Thanks for your feedback', data: toFeedbackView(feedback) };
  }
}
