import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';

export class SimNotFoundError extends Error {
  constructor(id: string) {
    super(`SIM ${id} not found`);
  }
}

export function serializeSim(s: StoredSim) {
  return {
    ...s,
    activationDate: s.activationDate?.toISOString() ?? null,
    expiryDate: s.expiryDate?.toISOString() ?? null,
    lastActivity: s.lastActivity?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

@Injectable()
export class GetSystemSimDetailUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(accessToken: string, simId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM inventory',
    });

    const sim = await this.simRepo.findById(simId);
    if (!sim) throw new SimNotFoundError(simId);

    return {
      status: true,
      message: 'SIM detail retrieved',
      data: serializeSim(sim),
    };
  }
}
