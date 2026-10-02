import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  emitSimChanged,
  type SimChangedEventPublisher,
} from './sim-changed-event.publisher';
import {
  NETWORK_NOT_TOLD,
  decideSimStatus,
  simStatusVerb,
  type SimStatusAction,
} from './sim-status-action';

export class SimStatusNotAllowedError extends Error {}

export type SimStatusItemResult = {
  id: string;
  iccid: string | null;
  outcome: 'changed' | 'skipped' | 'failed';
  reason: string | null;
  status: string | null;
};

@Injectable()
export class BulkSystemSimStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents: SimChangedEventPublisher,
  ) {}

  async execute(accessToken: string, ids: string[], action: SimStatusAction) {
    await this.authorize(accessToken);

    const results: SimStatusItemResult[] = [];
    for (const id of [...new Set(ids)]) results.push(await this.applyOne(id, action));

    const count = (outcome: SimStatusItemResult['outcome']) => results.filter((r) => r.outcome === outcome).length;
    const changed = count('changed');
    return {
      status: true,
      message: `${changed} SIM(s) marked ${simStatusVerb(action)} in our system; ${NETWORK_NOT_TOLD}`,
      data: { action, changed, skipped: count('skipped'), failed: count('failed'), results },
    };
  }

  async executeOne(accessToken: string, simId: string, action: SimStatusAction) {
    await this.authorize(accessToken);

    const current = await this.simRepo.findById(simId);
    if (!current) throw new SimNotFoundError(simId);
    const decision = decideSimStatus(current, action);
    if ('skipReason' in decision) throw new SimStatusNotAllowedError(decision.skipReason);

    await this.persist(decision.sim, action);
    return {
      status: true,
      message: `SIM marked ${simStatusVerb(action)} in our system; ${NETWORK_NOT_TOLD}`,
      data: serializeSim(decision.sim),
    };
  }

  private authorize(accessToken: string) {
    return ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to change SIM status',
    });
  }

  private async applyOne(id: string, action: SimStatusAction): Promise<SimStatusItemResult> {
    try {
      const current = await this.simRepo.findById(id);
      if (!current) return { id, iccid: null, outcome: 'failed', reason: 'SIM not found', status: null };
      const decision = decideSimStatus(current, action);
      if ('skipReason' in decision) {
        return { id, iccid: current.iccid, outcome: 'skipped', reason: decision.skipReason, status: current.status };
      }
      await this.persist(decision.sim, action);
      return { id, iccid: current.iccid, outcome: 'changed', reason: null, status: decision.sim.status };
    } catch (error) {
      return { id, iccid: null, outcome: 'failed', reason: (error as Error).message, status: null };
    }
  }

  private async persist(sim: Parameters<SimRepository['save']>[0], action: SimStatusAction) {
    await this.simRepo.save(sim);
    await emitSimChanged(this.simEvents, sim, action === 'suspend' ? 'suspended' : 'updated');
  }
}
