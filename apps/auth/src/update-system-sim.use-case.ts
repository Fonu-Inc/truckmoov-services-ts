import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SimNotFoundError, serializeSim } from './get-system-sim-detail.use-case';

export type UpdateSystemSimInput = {
  plan?: string;
  carrier?: string;
  dataLimitMb?: number;
  smsLimit?: number;
};

@Injectable()
export class UpdateSystemSimUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, simId: string, patch: UpdateSystemSimInput) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to update SIMs',
    });

    const sim = await this.simRepo.findById(simId);
    if (!sim) throw new SimNotFoundError(simId);

    if (patch.plan !== undefined) sim.plan = patch.plan;
    if (patch.carrier !== undefined) sim.carrier = patch.carrier;
    if (patch.dataLimitMb !== undefined) sim.dataLimitMb = patch.dataLimitMb;
    if (patch.smsLimit !== undefined) sim.smsLimit = patch.smsLimit;
    sim.updatedAt = new Date();
    await this.simRepo.save(sim);

    return {
      status: true,
      message: 'SIM updated',
      data: serializeSim(sim),
    };
  }
}
