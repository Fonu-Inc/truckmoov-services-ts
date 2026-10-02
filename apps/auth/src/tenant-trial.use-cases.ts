import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { ensureSystemActor } from './system-authz';
import { MAX_TRIAL_EXTENSION_DAYS, toTrialView, trialEndsAfter } from './tenant-trial';
import {
  TENANT_TRIAL_REPOSITORY,
  type StoredTenantTrial,
  type TenantTrialRepository,
} from './tenant-trial.repository';

const REASON_MIN = 5;
const REASON_MAX = 500;

export class InvalidTenantTrialError extends Error {}
export class TenantTrialNotFoundError extends Error {
  constructor() {
    super('This tenant has no trial on record');
  }
}
export class TenantTrialStateError extends Error {}

function cleanReason(raw: string | undefined, required: boolean): string | null {
  const reason = raw?.trim() ?? '';
  if (!reason && !required) return null;
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new InvalidTenantTrialError(`reason must be ${REASON_MIN} to ${REASON_MAX} characters`);
  }
  return reason;
}

@Injectable()
abstract class TenantTrialUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) protected readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) protected readonly users: UserRepository,
    @Inject(ListSystemTenantsUseCase) protected readonly tenants: ListSystemTenantsUseCase,
    @Inject(TENANT_TRIAL_REPOSITORY) protected readonly trials: TenantTrialRepository,
  ) {}

  protected async open(accessToken: string, tenantId: string, forbiddenMessage: string) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.users, { forbiddenMessage });
    const tenant = (await this.tenants.list(accessToken, {})).find((row) => row.id === tenantId);
    if (!tenant) throw new SystemTenantNotFoundError();
    const trial = await this.trials.findByTenant(tenantId);
    if (!trial) throw new TenantTrialNotFoundError();
    return { actor, tenant, trial };
  }

  protected async reply(tenantId: string, message: string) {
    const trial = (await this.trials.findByTenant(tenantId)) as StoredTenantTrial;
    return { status: true, message, data: { tenantId, trial: toTrialView(trial, new Date()) } };
  }
}

export type ExtendTenantTrialCommand = { accessToken: string; tenantId: string; days: number; reason: string };

@Injectable()
export class ExtendTenantTrialUseCase extends TenantTrialUseCase {
  async execute(command: ExtendTenantTrialCommand) {
    if (!Number.isInteger(command.days) || command.days < 1 || command.days > MAX_TRIAL_EXTENSION_DAYS) {
      throw new InvalidTenantTrialError(`days must be a whole number from 1 to ${MAX_TRIAL_EXTENSION_DAYS}`);
    }
    const reason = cleanReason(command.reason, true);
    const { actor, trial } = await this.open(command.accessToken, command.tenantId, 'Only system admins can extend a trial');
    if (trial.convertedAt) throw new TenantTrialStateError('This trial was already converted');

    const now = new Date();
    const from = trial.trialEndsAt > now ? trial.trialEndsAt : now;
    const trialEndsAt = trialEndsAfter(from, command.days);
    await this.trials.extend(command.tenantId, trialEndsAt, actor.id);

    return {
      ...(await this.reply(command.tenantId, 'Trial extended')),
      audit: { days: command.days, reason, previousEndsAt: trial.trialEndsAt.toISOString(), newEndsAt: trialEndsAt.toISOString() },
    };
  }
}

export type ConvertTenantTrialCommand = { accessToken: string; tenantId: string; reason?: string };

@Injectable()
export class ConvertTenantTrialUseCase extends TenantTrialUseCase {
  async execute(command: ConvertTenantTrialCommand) {
    const reason = cleanReason(command.reason, false);
    const { actor, tenant, trial } = await this.open(command.accessToken, command.tenantId, 'Only system admins can convert a trial');
    if (trial.convertedAt) throw new TenantTrialStateError('This trial was already converted');
    if (!tenant.planCode) throw new TenantTrialStateError('Assign a plan to this tenant before converting the trial');

    await this.trials.markConverted(command.tenantId, new Date(), tenant.planCode, actor.id);

    return {
      ...(await this.reply(command.tenantId, 'Trial converted')),
      audit: { planCode: tenant.planCode, reason },
    };
  }
}
