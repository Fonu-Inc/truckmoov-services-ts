import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import { PlatformAlertPublisher } from './platform-alert.publisher';
import { TenantNotificationPublisher } from './tenant-notification.publisher';
import {
  ORGANISATION_UPGRADE_REPOSITORY,
  UpgradeAlreadyDecidedError,
  UpgradeAlreadyRequestedError,
  UpgradeRequestNotFoundError,
  type OrganisationUpgradeRepository,
  type OrganisationUpgradeRequest,
} from './organisation-upgrade.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';

const SYSTEM_REVIEWER_ROLES = new Set<string>([
  Role.PLATFORM_ADMIN,
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

export class FleetSizeUnknownError extends Error {
  constructor() {
    super('The current fleet size could not be read, so this cannot be decided now');
  }
}

export class NotUpgradeableError extends Error {
  constructor(organisationType: string) {
    super(`A ${organisationType} organisation has no upgrade to request`);
  }
}

export class TargetPlanRequiredError extends Error {
  constructor() {
    super('A target plan is required to approve a promotion');
  }
}

export class TargetPlanNotFoundError extends Error {
  constructor(planCode: string) {
    super(`No subscription plan with code ${planCode}`);
  }
}

@Injectable()
export class RequestOrganisationUpgradeUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ORGANISATION_UPGRADE_REPOSITORY)
    private readonly requests: OrganisationUpgradeRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
  ) {}

  async execute(accessToken: string, reason: string): Promise<OrganisationUpgradeRequest> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    const onboarding = await this.onboarding.findByTenantId(actor.tenantId);
    const from = onboarding?.organizationType;
    // Only an owner-operator has somewhere to go. The screen exists because the
    // vehicle cap refuses them, and no other organisation type is capped that way.
    if (from !== 'owner_operator') throw new NotUpgradeableError(from ?? 'unknown');

    const open = await this.requests.findOpenForTenant(actor.tenantId);
    if (open) throw new UpgradeAlreadyRequestedError();

    // Recorded, not trusted. It is what the requester saw when they asked, and
    // it is re-read at review because a fleet changes.
    const statedVehicleCount = (await this.fleet.activeVehicleCount(actor.tenantId)) ?? 0;

    const request: OrganisationUpgradeRequest = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      fromOrganisationType: 'owner_operator',
      toOrganisationType: 'fleet_provider',
      reason: reason.trim(),
      statedVehicleCount,
      status: 'pending',
      requestedBy: actor.id,
      requestedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      reviewerNotes: null,
      vehicleCountAtReview: null,
      targetPlanCode: null,
    };

    await this.requests.save(request);

    // Staff are told a request is waiting. Nobody watches a queue that never
    // announces itself, which is how a request sits for weeks.
    await this.alerts.raise({
      alertType: 'new_tenant_signup',
      severity: 'low',
      subject: 'Organisation upgrade requested',
      body: `A tenant asked to be promoted to fleet provider with ${statedVehicleCount} active vehicle(s).`,
      context: { tenantId: actor.tenantId, requestId: request.id },
    });

    return request;
  }
}

@Injectable()
export class ReviewOrganisationUpgradeUseCase {
  private readonly logger = new Logger(ReviewOrganisationUpgradeUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ORGANISATION_UPGRADE_REPOSITORY)
    private readonly requests: OrganisationUpgradeRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(TenantNotificationPublisher)
    private readonly notifications: TenantNotificationPublisher,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY)
    private readonly plans: SubscriptionPlanRepository,
  ) {}

  async list(accessToken: string) {
    await this.requireReviewer(accessToken);
    const [pending, history, pendingCount] = await Promise.all([
      this.requests.findByStatus('pending'),
      this.requests.findRecentlyReviewed(50),
      this.requests.countPending(),
    ]);

    // The stated count is what the requester claimed. The queue shows the live
    // one, because a request from three weeks ago may not reflect the fleet.
    const withLiveCounts = await Promise.all(
      pending.map(async (request) => ({
        ...request,
        currentVehicleCount: await this.fleet.activeVehicleCount(request.tenantId),
      })),
    );

    return { pending: withLiveCounts, history, pendingCount };
  }

  async approve(
    accessToken: string,
    requestId: string,
    notes: string | null,
    targetPlanCode: string | null,
  ) {
    const actor = await this.requireReviewer(accessToken);
    const request = await this.loadOpen(requestId);

    // Read at the moment of decision, and refused outright if unavailable.
    // Approving on an unknown count would approve a promotion nothing justifies.
    const liveCount = await this.fleet.activeVehicleCount(request.tenantId);
    if (liveCount === null) throw new FleetSizeUnknownError();

    const onboarding = await this.onboarding.findByTenantId(request.tenantId);
    if (!onboarding) throw new UpgradeRequestNotFoundError();

    // Promotion is a plan change, not just a label: fleet_provider carries
    // different pricing and caps than owner_operator, so approving without a
    // target plan would promote the organisation onto a plan nothing chose.
    if (!targetPlanCode?.trim()) throw new TargetPlanRequiredError();
    const plan = await this.plans.findByCode(targetPlanCode.trim());
    if (!plan) throw new TargetPlanNotFoundError(targetPlanCode.trim());

    // Promotion changes the organisation's type, its plan and every
    // owner-operator role in it. A half-promoted organisation is badly broken,
    // so the type change, the plan change, the role change and the decision
    // are one unit of work.
    await this.onboarding.save({
      ...onboarding,
      organizationType: request.toOrganisationType,
      subscription: { ...onboarding.subscription, planCode: plan.code },
      updatedAt: new Date(),
    });

    const members = await this.userRepository.findAllByTenant(request.tenantId);
    for (const member of members) {
      if (member.role !== Role.OWNER_OPERATOR) continue;
      // The role carries the permissions and the navigation. Leaving it behind
      // would promote the organisation and not the people in it.
      await this.userRepository.save({ ...member, role: Role.FLEET_ADMIN });
    }

    const decided: OrganisationUpgradeRequest = {
      ...request,
      status: 'approved',
      reviewedBy: actor.id,
      reviewedAt: new Date().toISOString(),
      reviewerNotes: notes?.trim() || null,
      vehicleCountAtReview: liveCount,
      targetPlanCode: plan.code,
    };
    await this.requests.save(decided);

    await this.tellRequester(decided, 'Your organisation is now a fleet provider.');

    this.logger.log(`organisation_promoted:${request.tenantId}:vehicles=${liveCount}`);
    return decided;
  }

  async reject(accessToken: string, requestId: string, notes: string | null) {
    const actor = await this.requireReviewer(accessToken);
    const request = await this.loadOpen(requestId);

    const decided: OrganisationUpgradeRequest = {
      ...request,
      status: 'rejected',
      reviewedBy: actor.id,
      reviewedAt: new Date().toISOString(),
      // Captured at decision time. Reconstructing why a request was refused six
      // months later is otherwise impossible.
      reviewerNotes: notes?.trim() || null,
      vehicleCountAtReview: await this.fleet.activeVehicleCount(request.tenantId),
    };
    await this.requests.save(decided);
    await this.tellRequester(
      decided,
      `Your upgrade request was not approved.${decided.reviewerNotes ? ` Reason: ${decided.reviewerNotes}` : ''}`,
    );
    return decided;
  }

  /**
   * Tells the person who asked what was decided.
   *
   * A decision nobody hears about is the same as no decision: the requester is
   * still capped and has no idea why. Failure to send never undoes the
   * decision, which is already recorded.
   */
  private async tellRequester(
    request: OrganisationUpgradeRequest,
    message: string,
  ): Promise<void> {
    const requester = await this.userRepository.findById(request.requestedBy);
    if (!requester?.email) return;

    await this.notifications.notify({
      tenantId: request.tenantId,
      recipient: requester.email,
      channel: 'email',
      content: `Organisation upgrade decision\n\n${message}`,
      notificationType: 'organisation_upgrade_decision',
    });
  }

  private async loadOpen(requestId: string): Promise<OrganisationUpgradeRequest> {
    const request = await this.requests.findById(requestId);
    if (!request) throw new UpgradeRequestNotFoundError();
    if (request.status !== 'pending') throw new UpgradeAlreadyDecidedError(request.status);
    return request;
  }

  private async requireReviewer(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (!SYSTEM_REVIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError('You are not permitted to review upgrade requests');
    }
    return actor;
  }
}
