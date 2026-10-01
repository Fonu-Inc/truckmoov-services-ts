import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError } from './list-tenant-sims.use-case';
import { isHeldByTenantSuspension, reactivatedSim } from './sim-suspension';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  emitSimChanged,
  type SimChangedEventPublisher,
} from './sim-changed-event.publisher';

@Injectable()
export class ReactivateTenantSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents?: SimChangedEventPublisher,
  ) {}

  async execute(accessToken: string, simId: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot reactivate tenant SIMs');

    const sim = await this.simRepository.findById(simId);
    if (!sim || sim.tenantId !== actor.tenantId) throw new SimNotFoundError('SIM not found');
    if (sim.status !== 'suspended') throw new Error('SIM is not suspended');
    if (isHeldByTenantSuspension(sim)) throw new ForbiddenError('This SIM is paused by the platform');

    const reactivated = reactivatedSim(sim, 'active');
    await this.simRepository.save(reactivated);
    if (this.simEvents) await emitSimChanged(this.simEvents, reactivated, 'updated');

    return { status: true, message: 'success', data: { id: simId } };
  }
}
