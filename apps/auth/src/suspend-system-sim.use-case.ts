import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';

@Injectable()
export class SuspendSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  /**
   * Toggles a SIM between suspended and active. When `suspend` is provided the
   * target state is explicit; otherwise the current state is flipped.
   */
  async execute(accessToken: string, simId: string, suspend?: boolean) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to suspend SIMs',
    });

    const sim = await this.simRepo.findById(simId);
    if (!sim) throw new SimNotFoundError(simId);

    const shouldSuspend = suspend ?? sim.status !== 'suspended';
    sim.status = shouldSuspend ? 'suspended' : sim.tenantId ? 'assigned' : 'active';
    sim.updatedAt = new Date();
    await this.simRepo.save(sim);

    return {
      status: true,
      message: shouldSuspend ? 'SIM suspended' : 'SIM reactivated',
      data: serializeSim(sim),
    };
  }
}
