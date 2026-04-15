import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

@Injectable()
export class ListSystemSimsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async execute(
    accessToken: string,
    filters?: {
      status?: string;
      carrier?: string;
      tenantId?: string;
      search?: string;
    },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM inventory',
    });

    const sims = await this.simRepo.findAll(filters);

    return {
      status: true,
      message: 'SIM inventory retrieved',
      data: {
        total: sims.length,
        sims: sims.map((s) => ({
          ...s,
          activationDate: s.activationDate?.toISOString() ?? null,
          expiryDate: s.expiryDate?.toISOString() ?? null,
          lastActivity: s.lastActivity?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      },
    };
  }

  async list(
    accessToken: string,
    filters?: {
      status?: string;
      carrier?: string;
      tenantId?: string;
      search?: string;
    },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view SIM inventory',
    });
    return this.simRepo.findAll(filters);
  }
}
