import { Inject, Injectable } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import {
  LIMIT_BEHAVIOURS,
  ORGANISATION_TYPES,
  PAYMENT_MODELS,
  QUOTA_RESOURCES,
  USAGE_ITEMS,
  type PlanEntitlements,
} from './plan-entitlements';
import {
  SUBSCRIPTION_PLAN_REPOSITORY,
  type SubscriptionPlanRepository,
} from './subscription-plan.repository';

export class PlanEntitlementsNotFoundError extends Error {
  constructor() {
    super('Plan entitlements are not configured');
  }
}

export class InvalidPlanEntitlementsError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type UpdatePlanEntitlementsCommand = {
  accessToken: string;
  planId: string;
  patch: Partial<Omit<PlanEntitlements, 'planCode'>>;
};

function validatePatch(patch: UpdatePlanEntitlementsCommand['patch']): void {
  if (patch.paymentModel && !PAYMENT_MODELS.includes(patch.paymentModel)) {
    throw new InvalidPlanEntitlementsError('paymentModel is invalid');
  }
  if (patch.trialDays !== undefined && (!Number.isInteger(patch.trialDays) || patch.trialDays < 0)) {
    throw new InvalidPlanEntitlementsError('trialDays must be a non-negative integer');
  }
  if (patch.availableFor && patch.availableFor.some((value) => !ORGANISATION_TYPES.includes(value))) {
    throw new InvalidPlanEntitlementsError('availableFor contains an invalid organisation type');
  }
  if (patch.quotas) {
    for (const [resource, value] of Object.entries(patch.quotas)) {
      if (!QUOTA_RESOURCES.includes(resource as (typeof QUOTA_RESOURCES)[number])) {
        throw new InvalidPlanEntitlementsError(`Unknown quota resource: ${resource}`);
      }
      if (value !== 'unlimited' && (!Number.isInteger(value) || value < 0)) {
        throw new InvalidPlanEntitlementsError(`Quota ${resource} must be a non-negative integer or unlimited`);
      }
    }
  }
  if (patch.limitBehaviour) {
    for (const [resource, value] of Object.entries(patch.limitBehaviour)) {
      if (!QUOTA_RESOURCES.includes(resource as (typeof QUOTA_RESOURCES)[number])) {
        throw new InvalidPlanEntitlementsError(`Unknown limit behaviour resource: ${resource}`);
      }
      if (!LIMIT_BEHAVIOURS.includes(value as (typeof LIMIT_BEHAVIOURS)[number])) {
        throw new InvalidPlanEntitlementsError(`Invalid limit behaviour for ${resource}`);
      }
    }
  }
  if (patch.allowances?.some((allowance) =>
    !USAGE_ITEMS.includes(allowance.item) || !Number.isFinite(allowance.includedPerMonth) || allowance.includedPerMonth < 0,
  )) {
    throw new InvalidPlanEntitlementsError('allowances contain an invalid usage item or amount');
  }
}

@Injectable()
export class UpdatePlanEntitlementsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SUBSCRIPTION_PLAN_REPOSITORY) private readonly plans: SubscriptionPlanRepository,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY) private readonly entitlements: PlanEntitlementsRepository,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
  ) {}

  async execute(command: UpdatePlanEntitlementsCommand): Promise<PlanEntitlements> {
    const actor = await ensureSystemActor(command.accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to change plan entitlements',
    });
    const plan = await this.plans.findById(command.planId);
    if (!plan) throw new PlanEntitlementsNotFoundError();
    const current = await this.entitlements.findByPlanCode(plan.code);
    if (!current) throw new PlanEntitlementsNotFoundError();

    validatePatch(command.patch);
    const updated: PlanEntitlements = {
      ...current,
      ...command.patch,
      planCode: current.planCode,
      quotas: command.patch.quotas ? { ...current.quotas, ...command.patch.quotas } : current.quotas,
      limitBehaviour: command.patch.limitBehaviour
        ? { ...current.limitBehaviour, ...command.patch.limitBehaviour }
        : current.limitBehaviour,
    };
    await this.entitlements.save(updated, actor.id);
    await this.activityLog.record({
      tenantId: 'system',
      actorId: actor.id,
      actorRole: actor.role,
      service: 'auth',
      action: 'subscription_plan.entitlements_changed',
      entityType: 'subscription_plan',
      entityId: plan.id,
      summary: `Entitlements changed for plan ${plan.code}`,
      metadata: { patch: command.patch },
    });
    return updated;
  }
}
