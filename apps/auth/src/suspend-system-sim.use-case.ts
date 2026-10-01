import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';
import { reactivatedSim, suspendedSim } from './sim-suspension';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  emitSimChanged,
  type SimChangedEventPublisher,
} from './sim-changed-event.publisher';

@Injectable()
export class SuspendSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents?: SimChangedEventPublisher,
  ) {}

  /**
   * Toggles a SIM between suspended and active. When `suspend` is provided the
   * target state is explicit; otherwise the current state is flipped.
   */
  async execute(accessToken: string, simId: string, suspend?: boolean, reason?: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to suspend SIMs',
    });

    const current = await this.simRepo.findById(simId);
    if (!current) throw new SimNotFoundError(simId);

    const shouldSuspend = suspend ?? current.status !== 'suspended';
    const sim = shouldSuspend
      ? suspendedSim(current, reason?.trim() || null)
      : reactivatedSim(current, current.tenantId ? 'assigned' : 'active');
    await this.simRepo.save(sim);
    if (this.simEvents) await emitSimChanged(this.simEvents, sim, shouldSuspend ? 'suspended' : 'updated');

    return {
      status: true,
      message: shouldSuspend ? 'SIM suspended' : 'SIM reactivated',
      data: serializeSim(sim),
    };
  }
}
